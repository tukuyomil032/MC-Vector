#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

const PINNED_REVISION = '93b454efb8802dc7406d6873434f2aeec5c636f4';
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '../../../../');
const catalogPath = resolve(repositoryRoot, 'spec/map/coverage/builtin-renderers.json');
const astPath = resolve(repositoryRoot, 'spec/map/coverage/java-ast-inventory.json.gz');
const defaultOutput = resolve(repositoryRoot, 'spec/map/coverage/builtin-behavior-inventory.json.gz');
const fail = (message) => { throw new Error(message); };

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const blobSha1 = (bytes) => createHash('sha1').update(`blob ${bytes.length}\0`, 'utf8').update(bytes).digest('hex');
const git = (gitDirectory, args, encoding = 'utf8') => execFileSync(
  'git', [`--git-dir=${gitDirectory}`, ...args], { encoding, maxBuffer: 128 * 1024 * 1024 },
);

function parseArguments(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!['--source-root', '--git-dir', '--raw-json', '--output', '--write', '--check'].includes(flag)) {
      fail(`Unknown argument: ${flag}`);
    }
    if (flag === '--write' || flag === '--check') {
      if (values.has(flag)) fail(`Duplicate mode: ${flag}`);
      values.set(flag, true);
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) fail(`Missing value for ${flag}`);
    if (values.has(flag)) fail(`Duplicate argument: ${flag}`);
    values.set(flag, value);
    index += 1;
  }
  if (values.has('--write') === values.has('--check')) fail('Pass exactly one of --write or --check');
  for (const required of ['--source-root', '--git-dir', '--raw-json']) {
    if (!values.has(required)) fail(`Missing required argument: ${required}`);
  }
  return values;
}

export async function materializeRendererBehaviorInventory({ sourceRoot, gitDirectory, rawInventory }) {
  const absoluteSourceRoot = resolve(sourceRoot);
  const absoluteGitDirectory = resolve(gitDirectory);
  const raw = typeof rawInventory === 'string' ? JSON.parse(await readFile(rawInventory, 'utf8')) : rawInventory;
  const commit = git(absoluteGitDirectory, ['rev-parse', `${PINNED_REVISION}^{commit}`]).trim();
  if (commit !== PINNED_REVISION || raw.sourceRevision !== PINNED_REVISION) fail('Behavior inventory does not identify the exact pinned commit');
  const tree = git(absoluteGitDirectory, ['rev-parse', `${commit}^{tree}`]).trim();
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  const ast = JSON.parse(gunzipSync(await readFile(astPath)).toString('utf8'));
  if (catalog.sourceRevision !== commit || ast.sourceRevision !== commit || ast.sourceTreeSha1 !== tree) {
    fail('Renderer catalog/AST/tree identities do not agree');
  }
  if (!Array.isArray(raw.classes) || !Array.isArray(raw.parseErrors) || raw.parseErrors.length !== 0
      || raw.parsedFileCount !== raw.sourceFileCount || raw.classCount !== raw.classes.length) {
    fail('Raw javac renderer behavior inventory has parse errors or inconsistent counts');
  }
  const expectedClasses = new Set(catalog.entries.map((entry) => entry.class));
  const actualClasses = new Set(raw.classes.map((entry) => entry.class));
  const missingClasses = [...expectedClasses].filter((name) => !actualClasses.has(name));
  const extraClasses = [...actualClasses].filter((name) => !expectedClasses.has(name));
  if (missingClasses.length || extraClasses.length) {
    fail(`Behavior inventory/catalog class mismatch: missing=${missingClasses.join(',')}; extra=${extraClasses.join(',')}`);
  }

  const treeRows = git(absoluteGitDirectory, ['ls-tree', '-r', '-z', commit], null);
  const trackedJava = new Map();
  for (const record of treeRows.toString('utf8').split('\0')) {
    if (!record) continue;
    const tabIndex = record.indexOf('\t');
    if (tabIndex < 0) fail('Pinned Git tree has an invalid ls-tree record');
    const [mode, kind, objectId] = record.slice(0, tabIndex).split(' ');
    const sourcePath = record.slice(tabIndex + 1);
    if (kind === 'blob' && mode !== '120000' && sourcePath.endsWith('.java')) trackedJava.set(sourcePath, objectId);
  }
  const classes = [];
  let methodCount = 0;
  let branchSiteCount = 0;
  for (const entry of raw.classes) {
    const sourcePath = entry.sourcePath;
    const sourceBytes = await readFile(resolve(absoluteSourceRoot, sourcePath));
    if (blobSha1(sourceBytes) !== trackedJava.get(sourcePath)) fail(`Renderer source does not match pinned Git blob: ${sourcePath}`);
    const sourceContentSha256 = sha256(sourceBytes);
    if (sourceContentSha256 !== entry.sourceContentSha256) fail(`Renderer source does not match javac behavior input: ${sourcePath}`);
    const topType = ast.declarations.find((symbol) => symbol.sourcePath === sourcePath
      && symbol.kind !== 'method' && symbol.kind !== 'constructor' && symbol.owner === entry.qualifiedName);
    if (!topType) fail(`AST symbol inventory is missing renderer type ${entry.qualifiedName}`);
    const methodSymbols = ast.declarations.filter((symbol) => symbol.sourcePath === sourcePath
      && (symbol.kind === 'method' || symbol.kind === 'constructor'));
    const methodsBySpan = new Map(methodSymbols.map((symbol) => [`${symbol.startLine}:${symbol.endLine}`, symbol]));
    const behaviorSpans = entry.methods.map((method) => `${method.startLine}:${method.endLine}`).sort();
    const astSpans = methodSymbols.map((symbol) => `${symbol.startLine}:${symbol.endLine}`).sort();
    if (JSON.stringify(astSpans) !== JSON.stringify(behaviorSpans)) {
      fail(`Behavior method set differs from complete AST declaration set: ${entry.class}`);
    }
    const methods = entry.methods.map((method) => {
      const methodSymbol = methodsBySpan.get(`${method.startLine}:${method.endLine}`);
      if (!methodSymbol) fail(`Method source span has no AST declaration: ${method.signature}`);
      for (const branch of method.branches) {
        if (!/^FLOW-[0-9a-f]{16}$/.test(branch.branchId) || !Array.isArray(branch.outcomes) || branch.outcomes.length < 2) {
          fail(`Control-flow branch row is incomplete in ${method.signature}`);
        }
      }
      methodCount += 1;
      branchSiteCount += method.branches.length;
      return {
        symbolId: methodSymbol.symbolId,
        signature: methodSymbol.signature,
        sourceSpan: { startLine: method.startLine, endLine: method.endLine },
        branches: method.branches,
      };
    });
    classes.push({
      class: entry.class,
      qualifiedName: entry.qualifiedName,
      sourcePath,
      sourceGitBlobSha1: trackedJava.get(sourcePath),
      sourceContentSha256,
      methods,
    });
  }
  classes.sort((left, right) => left.class.localeCompare(right.class));
  const canonical = {
    schemaVersion: 1,
    sourceRepository: 'https://github.com/webbukkit/dynmap',
    sourceRevision: commit,
    sourceTreeSha1: tree,
    parser: raw.parser,
    parseMode: 'javac_parse_only_with_exact_control_flow_spans',
    counts: {
      sourceFiles: raw.sourceFileCount,
      parsedFiles: raw.parsedFileCount,
      classes: classes.length,
      methods: methodCount,
      branchSites: branchSiteCount,
      parseErrors: raw.parseErrors.length,
    },
    classes,
    parseErrors: raw.parseErrors,
  };
  return { canonical, compressed: gzipSync(Buffer.from(`${JSON.stringify(canonical)}\n`, 'utf8'), { level: 9 }) };
}

async function run() {
  const args = parseArguments(process.argv.slice(2));
  const { canonical, compressed } = await materializeRendererBehaviorInventory({
    sourceRoot: args.get('--source-root'),
    gitDirectory: args.get('--git-dir'),
    rawInventory: args.get('--raw-json'),
  });
  const output = resolve(args.get('--output') ?? defaultOutput);
  if (args.has('--write')) {
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, compressed);
  } else {
    const current = await readFile(output).catch(() => null);
    if (!current || !current.equals(compressed)) fail(`Pinned behavior inventory is missing or stale: ${output}`);
  }
  console.log(`${args.has('--write') ? 'Wrote' : 'Verified'} pinned renderer behavior inventory: `
    + `${canonical.counts.classes} classes, ${canonical.counts.methods} methods, `
    + `${canonical.counts.branchSites} AST branch sites, ${compressed.length} compressed bytes.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
