#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const manifestUrl = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

const fetchJson = async (url) => {
  const response = await fetch(url, { headers: { 'User-Agent': 'MC-Vector-map-version-matrix' } });
  if (!response.ok) throw new Error(`version metadata request failed: ${response.status} ${url}`);
  return response.json();
};

const parseVersion = (id) => id.split('.').map((part) => Number.parseInt(part, 10));
const compareVersion = (left, right) => {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
};

const inTargetRange = (version) =>
  compareVersion(version, '1.14') >= 0 && compareVersion(version, '26.3') <= 0;

const manifest = await fetchJson(manifestUrl);
const releases = manifest.versions.filter(
  (entry) =>
    entry.type === 'release' && /^\d+\.\d+(?:\.\d+)?$/.test(entry.id) && inTargetRange(entry.id),
);
const entries = [];
for (let index = 0; index < releases.length; index += 8) {
  const batch = releases.slice(index, index + 8);
  const details = await Promise.all(batch.map((entry) => fetchJson(entry.url)));
  for (const detail of details) {
    const client = detail.downloads?.client;
    const server = detail.downloads?.server;
    const assetIndex = detail.assetIndex;
    if (!client || !server || !assetIndex)
      throw new Error(`incomplete official metadata: ${detail.id}`);
    entries.push({
      minecraftVersion: detail.id,
      versionFamily: detail.id.split('.').slice(0, 2).join('.'),
      officialVersionManifestEntry: releases.find((entry) => entry.id === detail.id)?.url,
      releaseTime: detail.releaseTime,
      clientJar: { url: client.url, sha1: client.sha1, byteLength: client.size },
      serverJar: { url: server.url, sha1: server.sha1, byteLength: server.size },
      assetIndex: {
        id: assetIndex.id,
        url: assetIndex.url,
        sha1: assetIndex.sha1,
        byteLength: assetIndex.size,
      },
      paperBuild: null,
      paperJarSha256: null,
      dataVersion: null,
      minJavaVersion: detail.javaVersion?.majorVersion ?? null,
      chunkFormat: 'anvil',
      assetFormat: 'minecraft-resource-index',
      anvilAdapter: null,
      paperSnapshotAdapter: null,
      referenceCapture: null,
      status: 'metadata_verified',
      artifactStatus: 'not_downloaded',
    });
  }
}

entries.sort((left, right) => compareVersion(left.minecraftVersion, right.minecraftVersion));
const output = {
  schemaVersion: 2,
  range: { minimum: '1.14', maximum: '26.3', edition: 'java' },
  source: manifestUrl,
  generatedBy: 'scripts/fetch-map-version-metadata.mjs',
  status: 'metadata_cataloged',
  entries,
};
const outputPath = resolve(root, 'spec/map/coverage/version-matrix.json');
await mkdir(resolve(root, 'spec/map/coverage'), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(
  JSON.stringify(
    {
      entries: entries.length,
      minimum: entries[0]?.minecraftVersion,
      maximum: entries.at(-1)?.minecraftVersion,
    },
    null,
    2,
  ),
);
