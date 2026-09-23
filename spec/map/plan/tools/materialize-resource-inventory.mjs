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
const defaultOutput = resolve(repositoryRoot, 'spec/map/coverage/pinned-resource-inventory.json.gz');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const gitBlobSha1 = (bytes) => createHash('sha1')
  .update(`blob ${bytes.length}\0`, 'utf8')
  .update(bytes)
  .digest('hex');
const fail = (message) => { throw new Error(message); };

const git = (gitDirectory, args, { buffer = false } = {}) => execFileSync(
  'git',
  [`--git-dir=${gitDirectory}`, ...args],
  { encoding: buffer ? null : 'utf8', maxBuffer: 128 * 1024 * 1024 },
);

export async function materializeResourceInventory({
  sourceRoot,
  gitDirectory,
  expectedRevision = PINNED_REVISION,
}) {
  const absoluteSourceRoot = resolve(sourceRoot);
  const absoluteGitDirectory = resolve(gitDirectory);
  const commit = git(absoluteGitDirectory, ['rev-parse', `${expectedRevision}^{commit}`]).trim();
  if (commit !== expectedRevision) fail(`Pinned revision resolved to unexpected commit: ${commit}`);
  const tree = git(absoluteGitDirectory, ['rev-parse', `${commit}^{tree}`]).trim();
  const records = git(absoluteGitDirectory, ['ls-tree', '-r', '-z', commit], { buffer: true });
  const trackedResources = new Map();

  for (const record of records.toString('utf8').split('\0')) {
    if (!record) continue;
    const tabIndex = record.indexOf('\t');
    if (tabIndex < 0) fail('Pinned Git tree contains an unparsable ls-tree row');
    const [mode, objectType, objectId] = record.slice(0, tabIndex).split(' ');
    const sourcePath = record.slice(tabIndex + 1);
    if (!/(^|\/)resources\/[^/]/.test(sourcePath)) continue;
    if (objectType !== 'blob' || mode === '120000') {
      fail(`Resource path is not a regular pinned Git blob: ${sourcePath}`);
    }
    if (trackedResources.has(sourcePath)) fail(`Duplicate pinned resource path: ${sourcePath}`);
    trackedResources.set(sourcePath, { mode, objectId });
  }

  const entries = [];
  for (const sourcePath of [...trackedResources.keys()].sort()) {
    const absolutePath = resolve(absoluteSourceRoot, sourcePath);
    const relativePath = relative(absoluteSourceRoot, absolutePath);
    if (relativePath.startsWith(`..${sep}`) || relativePath === '..' || isAbsolute(relativePath)) {
      fail(`Resource path escapes the supplied source root: ${sourcePath}`);
    }
    const bytes = await readFile(absolutePath);
    const blobSha1 = gitBlobSha1(bytes);
    if (blobSha1 !== trackedResources.get(sourcePath).objectId) {
      fail(`Resource bytes do not match pinned Git blob: ${sourcePath}`);
    }
    const resourcesIndex = sourcePath.lastIndexOf('/resources/');
    const resourceRoot = resourcesIndex < 0 ? 'resources/' : sourcePath.slice(0, resourcesIndex + '/resources/'.length);
    entries.push({
      sourcePath,
      resourceRoot,
      relativePath: sourcePath.slice(resourceRoot.length),
      gitBlobSha1: blobSha1,
      contentSha256: sha256(bytes),
      byteLength: bytes.length,
      mode: trackedResources.get(sourcePath).mode,
    });
  }

  const inventory = {
    schemaVersion: 1,
    sourceRepository: 'https://github.com/webbukkit/dynmap',
    sourceRevision: commit,
    sourceTreeSha1: tree,
    sourceRevisionProvenance: 'verified_against_git_commit_and_resource_blob_ids',
    resourcePathRule: 'tracked regular Git blobs containing a resources/ path segment and at least one following path component',
    consumerClosureComplete: false,
    classificationComplete: false,
    counts: { resources: entries.length },
    entries,
  };
  return { inventory, compressed: gzipSync(Buffer.from(`${JSON.stringify(inventory)}\n`, 'utf8'), { level: 9 }) };
}

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

async function run() {
  const args = parseArguments(process.argv.slice(2));
  const { inventory, compressed } = await materializeResourceInventory({
    sourceRoot: args.get('--source-root'),
    gitDirectory: args.get('--git-dir'),
  });
  const output = resolve(args.get('--output') ?? defaultOutput);
  if (args.has('--write')) {
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, compressed);
  } else {
    const current = await readFile(output).catch(() => null);
    if (!current || !current.equals(compressed)) fail(`Resource inventory is missing or stale: ${output}`);
  }
  console.log(
    `${args.has('--write') ? 'Wrote' : 'Verified'} pinned resource path inventory: `
      + `${inventory.counts.resources} paths, ${compressed.length} compressed bytes; consumer closure remains open.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
