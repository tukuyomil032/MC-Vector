#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

export const PINNED_REVISION = '93b454efb8802dc7406d6873434f2aeec5c636f4';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '../../../../');
const defaultOutput = resolve(repositoryRoot, 'spec/map/coverage/java-ast-inventory.json.gz');

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const gitBlobSha1 = (bytes) => createHash('sha1')
  .update(`blob ${bytes.length}\0`, 'utf8')
  .update(bytes)
  .digest('hex');

const git = (gitDirectory, args, options = {}) => {
  const commandOptions = { maxBuffer: 128 * 1024 * 1024 };
  commandOptions.encoding = options.encoding === 'buffer' ? null : options.encoding ?? 'utf8';
  return execFileSync('git', [`--git-dir=${gitDirectory}`, ...args], commandOptions);
};

const fail = (message) => { throw new Error(message); };

export async function materializeAstInventory({
  sourceRoot,
  gitDirectory,
  rawInventory,
  expectedRevision = PINNED_REVISION,
}) {
  const absoluteSourceRoot = resolve(sourceRoot);
  const absoluteGitDirectory = resolve(gitDirectory);
  const raw = typeof rawInventory === 'string'
    ? JSON.parse(await readFile(rawInventory, 'utf8'))
    : rawInventory;

  const commit = git(absoluteGitDirectory, ['rev-parse', `${expectedRevision}^{commit}`]).trim();
  if (commit !== expectedRevision) fail(`Pinned revision resolved to unexpected commit: ${commit}`);
  const tree = git(absoluteGitDirectory, ['rev-parse', `${commit}^{tree}`]).trim();
  if (raw.sourceRevision !== expectedRevision) fail('AST input does not name the pinned revision');

  const treeRows = git(absoluteGitDirectory, ['ls-tree', '-r', '-z', commit], { encoding: 'buffer' });
  const trackedJava = new Map();
  for (const record of treeRows.toString('utf8').split('\0')) {
    if (!record) continue;
    const tabIndex = record.indexOf('\t');
    if (tabIndex < 0) fail('Pinned Git tree contains an unparsable ls-tree row');
    const [mode, objectType, objectId] = record.slice(0, tabIndex).split(' ');
    const sourcePath = record.slice(tabIndex + 1);
    if (objectType === 'blob' && mode !== '120000' && sourcePath.endsWith('.java')) {
      trackedJava.set(sourcePath, objectId);
    }
  }

  if (!Array.isArray(raw.sourceFiles) || !Array.isArray(raw.declarations)
      || !Array.isArray(raw.referenceCandidates) || !Array.isArray(raw.parseErrors)) {
    fail('AST input is missing required source/declaration/reference/parse arrays');
  }
  if (raw.parsedFileCount !== raw.sourceFileCount
      || raw.sourceFileCount !== raw.sourceFiles.length
      || raw.declarationCount !== raw.declarations.length
      || raw.referenceCandidateCount !== raw.referenceCandidates.length
      || raw.parseErrorCount !== raw.parseErrors.length) {
    fail('AST input counts do not match its arrays');
  }
  if (raw.parseErrorCount !== 0) fail(`AST input contains ${raw.parseErrorCount} parse errors`);
  if (raw.duplicateSymbolIdCount !== 0 || raw.duplicateSymbolIds?.length !== 0) {
    fail('AST input contains duplicate declaration IDs');
  }
  if (raw.semanticDependencyClosureComplete !== false) {
    fail('Syntax-only AST input must not claim semantic dependency closure');
  }

  const inventoryFiles = new Map();
  for (const entry of raw.sourceFiles) {
    if (!entry || typeof entry.sourcePath !== 'string' || typeof entry.contentSha256 !== 'string') {
      fail('AST source-file entry lacks a path or SHA-256');
    }
    if (inventoryFiles.has(entry.sourcePath)) fail(`Duplicate AST source path: ${entry.sourcePath}`);
    inventoryFiles.set(entry.sourcePath, entry);
  }
  const missingJava = [...trackedJava.keys()].filter((path) => !inventoryFiles.has(path));
  const extraJava = [...inventoryFiles.keys()].filter((path) => !trackedJava.has(path));
  if (missingJava.length || extraJava.length) {
    fail(`AST/Git Java path mismatch: missing=${missingJava.length}, extra=${extraJava.length}`);
  }

  const sourceFiles = [];
  for (const sourcePath of [...trackedJava.keys()].sort()) {
    const absolutePath = resolve(absoluteSourceRoot, sourcePath);
    const relativePath = relative(absoluteSourceRoot, absolutePath);
    if (relativePath.startsWith(`..${sep}`) || relativePath === '..' || isAbsolute(relativePath)) {
      fail(`Source path escapes the supplied source root: ${sourcePath}`);
    }
    const bytes = await readFile(absolutePath);
    const sourceSha256 = sha256(bytes);
    const blobSha1 = gitBlobSha1(bytes);
    if (blobSha1 !== trackedJava.get(sourcePath)) fail(`Source bytes do not match pinned Git blob: ${sourcePath}`);
    if (sourceSha256 !== inventoryFiles.get(sourcePath).contentSha256) {
      fail(`Source bytes do not match AST SHA-256: ${sourcePath}`);
    }
    sourceFiles.push({ sourcePath, gitBlobSha1: blobSha1, contentSha256: sourceSha256 });
  }

  const symbolIds = new Set();
  for (const declaration of raw.declarations) {
    if (!declaration || typeof declaration.symbolId !== 'string'
        || typeof declaration.signature !== 'string' || typeof declaration.sourcePath !== 'string') {
      fail('AST declaration lacks stable ID, signature, or source path');
    }
    if (symbolIds.has(declaration.symbolId)) fail(`Duplicate AST declaration ID: ${declaration.symbolId}`);
    symbolIds.add(declaration.symbolId);
    if (!trackedJava.has(declaration.sourcePath)) {
      fail(`AST declaration points outside the pinned Java tree: ${declaration.sourcePath}`);
    }
  }

  const referenceCandidates = raw.referenceCandidates.map((reference) => {
    if (!reference || typeof reference.sourcePath !== 'string'
        || typeof reference.contextSymbolId !== 'string' || typeof reference.kind !== 'string') {
      fail('AST reference candidate lacks source, context, or kind');
    }
    if (!trackedJava.has(reference.sourcePath)) {
      fail(`AST reference candidate points outside the pinned Java tree: ${reference.sourcePath}`);
    }
    return reference;
  });

  const canonical = {
    schemaVersion: 1,
    sourceRepository: 'https://github.com/webbukkit/dynmap',
    sourceRevision: commit,
    sourceTreeSha1: tree,
    sourceRevisionProvenance: 'verified_against_git_commit_and_java_blob_ids',
    parser: raw.parser,
    parseMode: 'syntax_only_no_symbol_resolution',
    semanticDependencyClosureComplete: false,
    closureStatus: 'syntax_inventory_verified_semantic_closure_open',
    counts: {
      sourceFiles: sourceFiles.length,
      parsedFiles: raw.parsedFileCount,
      declarations: raw.declarations.length,
      referenceCandidates: referenceCandidates.length,
      parseErrors: raw.parseErrors.length,
      duplicateSymbolIds: raw.duplicateSymbolIds.length,
    },
    sourceFiles,
    declarations: raw.declarations,
    referenceCandidates,
    parseErrors: raw.parseErrors,
  };
  const json = `${JSON.stringify(canonical)}\n`;
  return { canonical, compressed: gzipSync(Buffer.from(json, 'utf8'), { level: 9 }) };
}

function parseArguments(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!['--source-root', '--git-dir', '--ast-json', '--output', '--write', '--check'].includes(flag)) {
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
  for (const required of ['--source-root', '--git-dir', '--ast-json']) {
    if (!values.has(required)) fail(`Missing required argument: ${required}`);
  }
  return values;
}

async function run() {
  const args = parseArguments(process.argv.slice(2));
  const { canonical, compressed } = await materializeAstInventory({
    sourceRoot: args.get('--source-root'),
    gitDirectory: args.get('--git-dir'),
    rawInventory: args.get('--ast-json'),
  });
  const output = resolve(args.get('--output') ?? defaultOutput);
  if (args.has('--write')) {
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, compressed);
  } else {
    const current = await readFile(output).catch(() => null);
    if (!current || !current.equals(compressed)) fail(`AST inventory is missing or stale: ${output}`);
  }
  console.log(
    `${args.has('--write') ? 'Wrote' : 'Verified'} pinned AST inventory: `
      + `${canonical.counts.sourceFiles} source files, ${canonical.counts.declarations} declarations, `
      + `${canonical.counts.referenceCandidates} unresolved syntax reference candidates, `
      + `${compressed.length} compressed bytes; semantic closure remains open.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
