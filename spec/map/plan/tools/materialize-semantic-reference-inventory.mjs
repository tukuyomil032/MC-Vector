#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const PINNED_REVISION = '93b454efb8802dc7406d6873434f2aeec5c636f4';
const scriptDirectory = resolve(import.meta.dirname);
const repositoryRoot = resolve(scriptDirectory, '../../../../');
const defaultOutput = resolve(repositoryRoot, 'spec/map/coverage/java-semantic-references.json.gz');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = (message) => { throw new Error(message); };

export function validateSemanticReferenceInventory(inventory) {
  if (inventory?.sourceRevision !== PINNED_REVISION) fail('Semantic reference inventory is not bound to the pinned Dynmap revision');
  if (inventory?.status !== 'attribution_inventory_only_closure_open' || inventory?.closureComplete !== false) {
    fail('Semantic reference inventory must retain its explicitly open closure status');
  }
  if (!Array.isArray(inventory.references) || inventory.references.length === 0
      || inventory.counts?.references !== inventory.references.length
      || inventory.counts?.parseDiagnostics !== 0
      || inventory.counts?.sourceFiles !== 856
      || inventory.counts?.parsedFiles !== 856) {
    fail('Semantic reference inventory counts disagree or parsing is incomplete');
  }
  return inventory;
}

function parseArguments(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (!['--input', '--output', '--write', '--check'].includes(flag)) fail(`Unknown argument: ${flag}`);
    if (flag === '--write' || flag === '--check') {
      if (values.has(flag)) fail(`Duplicate mode: ${flag}`);
      values.set(flag, true);
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) fail(`Missing value for ${flag}`);
    if (values.has(flag)) fail(`Duplicate argument: ${flag}`);
    values.set(flag, value);
    index++;
  }
  if (values.has('--write') === values.has('--check')) fail('Pass exactly one of --write or --check');
  if (!values.has('--input')) fail('Pass --input with the javac semantic inventory');
  return values;
}

async function run() {
  const args = parseArguments(process.argv.slice(2));
  const inputPath = resolve(args.get('--input'));
  const outputPath = resolve(args.get('--output') ?? defaultOutput);
  const sourceBytes = await readFile(inputPath);
  const inventory = validateSemanticReferenceInventory(JSON.parse(sourceBytes.toString('utf8')));
  const outputBytes = gzipSync(sourceBytes, { level: 9, mtime: 0 });
  if (args.has('--write')) {
    await import('node:fs/promises').then(({ mkdir }) => mkdir(dirname(outputPath), { recursive: true }));
    await writeFile(outputPath, outputBytes);
  } else {
    const current = await readFile(outputPath).catch(() => null);
    if (!current?.equals(outputBytes)) fail(`Semantic reference inventory is missing or stale: ${outputPath}`);
  }
  console.log(`Semantic inventory retained open: ${inventory.references.length} reference occurrences; input sha256=${digest(sourceBytes)}; gzip bytes=${outputBytes.length}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
