#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const matrix = JSON.parse(
  await readFile(resolve(root, 'spec/map/coverage/version-matrix.json'), 'utf8'),
);
const failures = [];
const sha1 = /^[0-9a-f]{40}$/;
const allowedHosts = new Set(['piston-meta.mojang.com', 'piston-data.mojang.com']);

if (matrix.source !== 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json') {
  failures.push('version matrix must come from the official Mojang manifest');
}
for (const entry of matrix.entries ?? []) {
  for (const [name, artifact] of Object.entries({
    clientJar: entry.clientJar,
    serverJar: entry.serverJar,
    assetIndex: entry.assetIndex,
  })) {
    if (!artifact || !sha1.test(artifact.sha1))
      failures.push(`${entry.minecraftVersion}: invalid ${name} sha1`);
    try {
      const url = new URL(artifact.url);
      if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname))
        failures.push(`${entry.minecraftVersion}: untrusted ${name} host`);
      if (url.search || url.hash) failures.push(`${entry.minecraftVersion}: mutable ${name} URL`);
    } catch {
      failures.push(`${entry.minecraftVersion}: invalid ${name} URL`);
    }
  }
  if (entry.status === 'planned') failures.push(`${entry.minecraftVersion}: planned status`);
  if (
    entry.artifactStatus === 'verified' &&
    (!entry.paperBuild || !entry.dataVersion || !entry.anvilAdapter || !entry.paperSnapshotAdapter)
  ) {
    failures.push(`${entry.minecraftVersion}: verified entry is missing adapter evidence`);
  }
}
if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Map version metadata verified: ${matrix.entries.length} official releases`);
}
