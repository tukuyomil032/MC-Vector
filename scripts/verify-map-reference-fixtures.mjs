#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const fixtureRoot = resolve(root, 'tests/fixtures/map/dynmap-reference/r29');
const fixtures = ['box', 'cuboid', 'pane', 'plant'];

for (const renderer of fixtures) {
  const expected = JSON.parse(await readFile(resolve(fixtureRoot, `${renderer}.json`), 'utf8'));
  const result = spawnSync('bun', ['scripts/run-dynmap-reference-harness.mjs', renderer], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`reference harness failed for ${renderer}: ${result.stderr.trim()}`);
  }
  const actual = JSON.parse(result.stdout);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`reference trace mismatch for ${renderer}`);
  }
}

console.log(`Dynmap reference fixtures verified: ${fixtures.length}`);
