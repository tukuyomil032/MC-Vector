#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const loadJson = (relativePath) => JSON.parse(readFileSync(resolve(root, relativePath), 'utf8'));
const versionMatrix = loadJson('spec/map/coverage/version-matrix.json');
const evidenceMatrix = loadJson('spec/map/evidence/real-acceptance-matrix.json');
const requireComplete = process.argv.includes('--require-complete');
const requiredEvidence = [
  'coreArtifact',
  'paperPluginLoad',
  'bridgeHandshake',
  'loadedSnapshot',
  'savedLiveSource',
  'terrainRender',
  'tileCache',
  'realTauriIpc',
  'mapUi',
  'zoomPan',
  'failureSafety',
  'shutdown',
  'javaExit',
  'portRelease',
];
const allowedStatuses = new Set(['pending', 'verified', 'blocked', 'unsupported']);
const failures = [];

if (evidenceMatrix.versionMatrix !== 'spec/map/coverage/version-matrix.json') {
  failures.push('evidence matrix must reference the canonical version matrix');
}
if (!evidenceMatrix.defaultRecord || typeof evidenceMatrix.defaultRecord !== 'object') {
  failures.push('defaultRecord is required');
}
if (!evidenceMatrix.overrides || typeof evidenceMatrix.overrides !== 'object') {
  failures.push('overrides must be an object');
}

function validateRecord(label, record) {
  if (!record || typeof record !== 'object') {
    failures.push(`${label}: record must be an object`);
    return;
  }
  if (!allowedStatuses.has(record.status)) {
    failures.push(`${label}: invalid status ${record.status ?? '<missing>'}`);
  }
  if (!record.reason && record.status !== 'verified') {
    failures.push(`${label}: non-verified record requires a reason`);
  }
  if (!record.evidence || typeof record.evidence !== 'object') {
    failures.push(`${label}: evidence object is required`);
    return;
  }
  for (const key of requiredEvidence) {
    const item = record.evidence[key];
    if (!item || typeof item !== 'object') {
      failures.push(`${label}: missing evidence ${key}`);
      continue;
    }
    if (!allowedStatuses.has(item.status)) {
      failures.push(`${label}.${key}: invalid status ${item.status ?? '<missing>'}`);
    }
    if (item.status === 'verified' && (!item.command || !item.artifact || !item.result)) {
      failures.push(`${label}.${key}: verified evidence requires command, artifact, and result`);
    }
    if (item.status !== 'verified' && !item.reason && !record.reason) {
      failures.push(`${label}.${key}: non-verified evidence requires a reason`);
    }
    const serialized = JSON.stringify(item);
    if (
      /(^|[\\/])Users[\\/]|(^|[\\/])home[\\/]|token|authorization|rawHttpBody/i.test(serialized)
    ) {
      failures.push(`${label}.${key}: raw path or secret-like value is forbidden`);
    }
  }
}

validateRecord('defaultRecord', evidenceMatrix.defaultRecord);
for (const [version, record] of Object.entries(evidenceMatrix.overrides ?? {})) {
  if (!versionMatrix.entries.some((entry) => entry.minecraftVersion === version)) {
    failures.push(`override ${version}: missing from version matrix`);
  }
  validateRecord(`override ${version}`, record);
}

const resolved = versionMatrix.entries.map((entry) => ({
  version: entry.minecraftVersion,
  record: evidenceMatrix.overrides?.[entry.minecraftVersion] ?? evidenceMatrix.defaultRecord,
}));
const blocked = resolved.filter(({ record }) => record.status === 'blocked').length;
const pending = resolved.filter(({ record }) => record.status === 'pending').length;
const unverified = resolved.filter(({ record }) => record.status !== 'verified').length;

if (requireComplete && unverified > 0) {
  failures.push(`${unverified} version acceptance records are not verified`);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `Map acceptance evidence shape verified: ${resolved.length} versions, ` +
      `${blocked} blocked, ${pending} pending, ${resolved.length - unverified} verified`,
  );
}
