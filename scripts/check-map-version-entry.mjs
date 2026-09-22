#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const version = process.argv[2];
if (!version) {
  console.error('usage: node scripts/check-map-version-entry.mjs <minecraft-version>');
  process.exitCode = 2;
} else {
  const root = resolve(import.meta.dirname, '..');
  const matrix = JSON.parse(
    readFileSync(resolve(root, 'spec/map/coverage/version-matrix.json'), 'utf8'),
  );
  const entry = matrix.entries?.find((candidate) => candidate.minecraftVersion === version);
  const failures = [];

  if (!entry) {
    failures.push(`${version}: missing from version matrix`);
  } else {
    if (!entry.versionFamily) failures.push(`${version}: missing version family`);
    if (!entry.officialVersionManifestEntry)
      failures.push(`${version}: missing official manifest entry`);
    for (const name of ['clientJar', 'serverJar', 'assetIndex']) {
      const artifact = entry[name];
      if (!artifact?.url || !/^[0-9a-f]{40}$/.test(artifact.sha1)) {
        failures.push(`${version}: incomplete ${name} metadata`);
      }
    }
    if (entry.status === 'planned') failures.push(`${version}: planned status`);
    if (entry.artifactStatus === 'verified' && entry.status !== 'verified') {
      failures.push(`${version}: verified artifact with non-verified entry status`);
    }
  }

  if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`Map version entry verified: ${version} (${entry.status}/${entry.artifactStatus})`);
  }
}
