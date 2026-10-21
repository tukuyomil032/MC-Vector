#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const PINNED_REVISION = '93b454efb8802dc7406d6873434f2aeec5c636f4';
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '../../../../');
const builtinCatalogPath = resolve(repositoryRoot, 'spec/map/coverage/builtin-renderers.json');
const astInventoryPath = resolve(repositoryRoot, 'spec/map/coverage/java-ast-inventory.json.gz');
const defaultOutput = resolve(repositoryRoot, 'spec/map/coverage/builtin-dispatch-inventory.json');

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const git = (gitDirectory, args, encoding = 'utf8') => execFileSync(
  'git', [`--git-dir=${gitDirectory}`, ...args], { encoding, maxBuffer: 128 * 1024 * 1024 },
);
const fail = (message) => { throw new Error(message); };

function parseArguments(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!['--source-root', '--git-dir', '--output', '--write', '--check'].includes(flag)) {
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
  for (const required of ['--source-root', '--git-dir']) {
    if (!values.has(required)) fail(`Missing required argument: ${required}`);
  }
  return values;
}

function pinnedTree(gitDirectory) {
  const commit = git(gitDirectory, ['rev-parse', `${PINNED_REVISION}^{commit}`]).trim();
  if (commit !== PINNED_REVISION) fail(`Pinned revision resolved to unexpected commit: ${commit}`);
  const tree = git(gitDirectory, ['rev-parse', `${commit}^{tree}`]).trim();
  const rows = git(gitDirectory, ['ls-tree', '-r', '-z', commit], null);
  const blobs = new Map();
  for (const record of rows.toString('utf8').split('\0')) {
    if (!record) continue;
    const tabIndex = record.indexOf('\t');
    if (tabIndex < 0) fail('Pinned Git tree contains an invalid ls-tree record');
    const [mode, type, objectId] = record.slice(0, tabIndex).split(' ');
    if (type === 'blob' && mode !== '120000') blobs.set(record.slice(tabIndex + 1), objectId);
  }
  return { commit, tree, blobs };
}

function sourceEvidenceId(sourcePath, line, recordSha256) {
  return `REG-${sha256(`${sourcePath}:${line}:${recordSha256}`).slice(0, 16)}`;
}

function parseCustomBlock(line) {
  const recordStart = line.indexOf('customblock:');
  if (recordStart < 0) return null;
  const versionGuard = line.slice(0, recordStart).trim().replace(/^\[/, '').replace(/\]$/, '');
  const fields = [];
  for (const token of line.slice(recordStart + 'customblock:'.length).split(',')) {
    const separator = token.indexOf('=');
    if (separator < 0) continue;
    fields.push([token.slice(0, separator).trim(), token.slice(separator + 1).trim()]);
  }
  const rendererClass = fields.find(([key]) => key === 'class')?.[1];
  if (!rendererClass?.startsWith('org.dynmap.hdmap.renderer.')) return null;
  const values = (name) => fields.filter(([key]) => key === name).map(([, value]) => value);
  return {
    rendererClass: rendererClass.slice('org.dynmap.hdmap.renderer.'.length),
    versionGuard: versionGuard || null,
    blockSelectors: values('id'),
    legacyDataSelectors: values('data'),
    stateSelectors: values('state'),
    parameterKeys: [...new Set(fields.map(([key]) => key).filter((key) => !['id', 'data', 'state', 'class'].includes(key)))].sort(),
  };
}

export async function materializeBuiltinDispatchInventory({ sourceRoot, gitDirectory }) {
  const sourceDirectory = resolve(sourceRoot);
  const tree = pinnedTree(resolve(gitDirectory));
  const catalog = JSON.parse(await readFile(builtinCatalogPath, 'utf8'));
  const ast = JSON.parse(gunzipSync(await readFile(astInventoryPath)).toString('utf8'));
  if (catalog.sourceRevision !== PINNED_REVISION || ast.sourceRevision !== PINNED_REVISION) {
    fail('Built-in catalog and AST inventory must use the pinned Dynmap revision');
  }
  if (tree.commit !== PINNED_REVISION || ast.sourceTreeSha1 !== tree.tree) fail('Pinned source tree identity does not match the AST inventory');

  const rendererEntries = new Map(catalog.entries.map((entry) => [entry.class, entry]));
  const definitions = new Map([...rendererEntries.keys()].map((name) => [name, []]));
  const scannedFiles = [];
  const candidatePaths = [...tree.blobs.keys()]
    .filter((path) => path.endsWith('.txt') && (path.includes('/renderdata/') || /\/models_[0-9]+\.txt$/.test(path)))
    .sort();

  for (const sourcePath of candidatePaths) {
    const absolutePath = resolve(sourceDirectory, sourcePath);
    const bytes = await readFile(absolutePath);
    const blob = createHash('sha1').update(`blob ${bytes.length}\0`, 'utf8').update(bytes).digest('hex');
    if (blob !== tree.blobs.get(sourcePath)) fail(`Configuration bytes differ from pinned Git blob: ${sourcePath}`);
    const contentSha256 = sha256(bytes);
    const lines = bytes.toString('utf8').split(/\r?\n/);
    let matchedRecords = 0;
    for (let index = 0; index < lines.length; index += 1) {
      const parsed = parseCustomBlock(lines[index]);
      if (!parsed) continue;
      matchedRecords += 1;
      const catalogEntry = rendererEntries.get(parsed.rendererClass);
      if (!catalogEntry) {
        fail(`Pinned renderer definition references an untracked built-in class ${parsed.rendererClass} at ${sourcePath}:${index + 1}`);
      }
      const lineSha256 = sha256(Buffer.from(lines[index], 'utf8'));
      definitions.get(parsed.rendererClass).push({
        evidenceId: sourceEvidenceId(sourcePath, index + 1, lineSha256),
        sourcePath,
        sourceLine: index + 1,
        sourceFileSha256: contentSha256,
        recordSha256: lineSha256,
        versionGuard: parsed.versionGuard,
        blockSelectors: parsed.blockSelectors,
        legacyDataSelectors: parsed.legacyDataSelectors,
        stateSelectors: parsed.stateSelectors,
        parameterKeys: parsed.parameterKeys,
      });
    }
    scannedFiles.push({ sourcePath, gitBlobSha1: tree.blobs.get(sourcePath), contentSha256, matchedRecords });
  }

  const customBlockModel = ast.declarations.filter((row) => row.sourcePath === 'DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java');
  const hdbmSource = 'DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java';
  const loaderReferences = ast.referenceCandidates.filter((row) => row.sourcePath === 'DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java'
    && row.kind === 'method_call_candidate' && row.target === 'Class.forName');
  const customblockParser = ast.declarations.find((row) => row.sourcePath === hdbmSource
    && row.kind === 'method' && row.startLine <= 1077 && row.endLine >= 1077);
  if (!customBlockModel.some((row) => row.kind === 'class' && row.owner === 'org.dynmap.hdmap.CustomBlockModel')
      || loaderReferences.length === 0 || !customblockParser) {
    fail('Could not resolve the source-backed customblock reflective dispatch chain');
  }

  const dynamicDispatch = {
    routeId: 'DISPATCH-CUSTOMBLOCK-CLASS-REFLECTION',
    configurationKey: 'customblock:class',
    parserSymbolId: customblockParser.symbolId,
    parserSignature: customblockParser.signature,
    parserSourcePath: hdbmSource,
    parserStartLine: customblockParser.startLine,
    parserEndLine: customblockParser.endLine,
    classLoaderSymbolId: loaderReferences[0].contextSymbolId,
    classLoaderSourcePath: loaderReferences[0].sourcePath,
    classLoaderLine: loaderReferences[0].line,
    classLoaderCall: loaderReferences[0].target,
    missingStaticDefinitionsRemainDynamicallyReachable: true,
  };

  const classes = [];
  for (const entry of [...rendererEntries.values()].sort((left, right) => left.class.localeCompare(right.class))) {
    const directDefinitions = definitions.get(entry.class).sort((left, right) => left.sourcePath.localeCompare(right.sourcePath) || left.sourceLine - right.sourceLine);
    const sourcePath = entry.sourcePath;
    const sourceBlob = tree.blobs.get(sourcePath);
    if (!sourceBlob) fail(`Built-in source file is not in the pinned tree: ${sourcePath}`);
    const sourceBytes = await readFile(resolve(sourceDirectory, sourcePath));
    const actualSourceBlob = createHash('sha1').update(`blob ${sourceBytes.length}\0`, 'utf8').update(sourceBytes).digest('hex');
    if (actualSourceBlob !== sourceBlob) fail(`Built-in Java source differs from pinned Git blob: ${sourcePath}`);
    classes.push({
      class: entry.class,
      sourcePath,
      sourceGitBlobSha1: sourceBlob,
      sourceContentSha256: sha256(sourceBytes),
      dispatchKind: directDefinitions.length > 0 ? 'pinned_configuration_and_reflection' : 'reflection_configuration_only',
      directDefinitions,
      reflectiveDispatchId: dynamicDispatch.routeId,
      negativeSearchScope: directDefinitions.length > 0 ? null : 'all_pinned_models_and_renderdata_text_files',
      evidenceRequirement: directDefinitions.length > 0
        ? 'Cover every matching pinned definition and its version guard, selectors, and parameter keys.'
        : 'Test caller-supplied customblock definitions through the pinned reflection and initializer contract; no pinned static record exists.',
    });
  }

  const result = {
    schemaVersion: 1,
    sourceRepository: 'https://github.com/webbukkit/dynmap',
    sourceRevision: tree.commit,
    sourceTreeSha1: tree.tree,
    generatedBy: 'spec/map/plan/tools/materialize-builtin-dispatch-inventory.mjs',
    configurationSearch: {
      resourcePathRule: 'tracked .txt files under */renderdata/ and tracked models_<integer>.txt files',
      scannedFileCount: scannedFiles.length,
      scannedFileSha256: sha256(Buffer.from(JSON.stringify(scannedFiles))),
      matchingCustomBlockRecordCount: scannedFiles.reduce((total, file) => total + file.matchedRecords, 0),
      files: scannedFiles,
    },
    dynamicDispatch,
    classes,
    counts: {
      catalogClasses: classes.length,
      classesWithPinnedDefinitions: classes.filter((entry) => entry.directDefinitions.length > 0).length,
      reflectionOnlyClasses: classes.filter((entry) => entry.directDefinitions.length === 0).length,
      matchingCustomBlockRecords: scannedFiles.reduce((total, file) => total + file.matchedRecords, 0),
    },
  };
  return `${JSON.stringify(result, null, 2)}\n`;
}

async function run() {
  const args = parseArguments(process.argv.slice(2));
  const output = resolve(args.get('--output') ?? defaultOutput);
  const content = await materializeBuiltinDispatchInventory({
    sourceRoot: args.get('--source-root'),
    gitDirectory: args.get('--git-dir'),
  });
  if (args.has('--write')) {
    await writeFile(output, content);
  } else {
    const existing = await readFile(output, 'utf8').catch(() => null);
    if (existing !== content) fail(`Built-in dispatch inventory is missing or stale: ${output}`);
  }
  const data = JSON.parse(content);
  console.log(`${args.has('--write') ? 'Wrote' : 'Verified'} pinned built-in dispatch inventory: `
    + `${data.counts.catalogClasses} classes, ${data.counts.classesWithPinnedDefinitions} with direct config records, `
    + `${data.counts.reflectionOnlyClasses} reflection-only classes, ${data.counts.matchingCustomBlockRecords} records.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
