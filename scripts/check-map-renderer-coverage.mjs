#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const revision = '93b454efb8802dc7406d6873434f2aeec5c636f4';
const strict = new Set(process.argv.slice(2));

const load = async (relativePath) =>
  JSON.parse(await readFile(resolve(root, relativePath), 'utf8'));

const catalogs = {
  symbols: await load('spec/map/coverage/source-symbols.json'),
  resources: await load('spec/map/coverage/resources.json'),
  builtins: await load('spec/map/coverage/builtin-renderers.json'),
  versions: await load('spec/map/coverage/version-matrix.json'),
};

const failures = [];
for (const [name, catalog] of Object.entries(catalogs)) {
  if (name !== 'versions' && catalog.sourceRevision !== revision) {
    failures.push(`${name}: source revision mismatch`);
  }
  if (!Array.isArray(catalog.entries) || catalog.entries.length === 0) {
    failures.push(`${name}: catalog is empty`);
  }
  for (const entry of catalog.entries ?? []) {
    if (entry.status === 'planned')
      failures.push(`${name}: planned entry ${entry.sourcePath ?? entry.class}`);
    if (name !== 'versions' && !entry.sourceRevision)
      failures.push(`${name}: missing entry revision ${entry.sourcePath ?? entry.class}`);
  }
}

if (strict.has('--require-all-symbols')) {
  for (const entry of catalogs.symbols.entries) {
    if (entry.implementationStatus !== 'verified') {
      failures.push(`symbols: incomplete implementation ${entry.sourcePath}`);
    }
    for (const symbol of entry.symbols ?? []) {
      if (!symbol.evidence)
        failures.push(`symbols: missing evidence ${entry.sourcePath}#${symbol.name}`);
    }
  }
}
if (strict.has('--require-all-resources')) {
  for (const entry of catalogs.resources.entries) {
    if (entry.scope === 'renderer-asset' && entry.implementationStatus !== 'verified') {
      failures.push(`resources: incomplete renderer resource ${entry.sourcePath}`);
    }
  }
}
if (strict.has('--require-all-builtins')) {
  for (const entry of catalogs.builtins.entries) {
    if (entry.implementationStatus !== 'verified') {
      failures.push(`builtins: incomplete implementation ${entry.class}`);
    }
  }
}
if (strict.has('--require-all-versions')) {
  for (const entry of catalogs.versions.entries) {
    if (entry.artifactStatus !== 'verified' || entry.status !== 'verified') {
      failures.push(`versions: incomplete implementation ${entry.minecraftVersion}`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `Map renderer coverage catalog verified: ${catalogs.symbols.entries.length} source files, ` +
      `${catalogs.resources.entries.length} resources, ${catalogs.builtins.entries.length} built-in renderers`,
  );
}
