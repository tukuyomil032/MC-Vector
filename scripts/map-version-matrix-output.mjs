#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const matrixPath = resolve(root, 'spec/map/coverage/version-matrix.json');
const matrix = JSON.parse(readFileSync(matrixPath, 'utf8'));

if (!Array.isArray(matrix.entries) || matrix.entries.length === 0) {
  throw new Error('version matrix has no entries');
}

const include = matrix.entries.map((entry) => ({
  minecraftVersion: entry.minecraftVersion,
  versionFamily: entry.versionFamily,
  status: entry.status,
  artifactStatus: entry.artifactStatus,
}));
const output = JSON.stringify({ include });

// stdout carries only the JSON so workflows can capture it into $GITHUB_OUTPUT.
console.error(`Generated map version matrix with ${include.length} entries`);
console.log(output);
