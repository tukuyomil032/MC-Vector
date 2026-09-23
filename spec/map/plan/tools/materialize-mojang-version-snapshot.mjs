#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

export const OFFICIAL_MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
export const MINIMUM_RELEASE = '1.14';
export const DEFAULT_SNAPSHOT_DATE = '2026-09-23';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '../../../../');
const coverageDirectory = resolve(repositoryRoot, 'spec/map/coverage');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = (message) => { throw new Error(message); };

export const compareDottedVersions = (left, right) => {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
};

const isCanonicalDottedVersion = (value) => typeof value === 'string'
  && /^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*))*$/.test(value);

export function materializeMojangVersionSnapshot(manifestBytes, snapshotDate = DEFAULT_SNAPSHOT_DATE) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) fail(`Invalid snapshot date: ${snapshotDate}`);
  let manifest;
  try {
    manifest = JSON.parse(Buffer.from(manifestBytes).toString('utf8'));
  } catch {
    fail('Official Mojang version manifest is not valid UTF-8 JSON');
  }
  if (!manifest || !Array.isArray(manifest.versions) || typeof manifest.latest?.release !== 'string') {
    fail('Official Mojang version manifest is missing required versions/latest.release fields');
  }

  const stableReleases = manifest.versions.filter((entry) => entry?.type === 'release'
    && isCanonicalDottedVersion(entry.id)
    && compareDottedVersions(entry.id, MINIMUM_RELEASE) >= 0);
  const seen = new Set();
  for (const release of stableReleases) {
    if (seen.has(release.id)) fail(`Duplicate stable release ID: ${release.id}`);
    seen.add(release.id);
    if (typeof release.url !== 'string' || typeof release.time !== 'string' || typeof release.releaseTime !== 'string') {
      fail(`Stable release metadata is incomplete: ${release.id}`);
    }
  }
  if (stableReleases.length === 0) fail(`No stable Java releases at or after ${MINIMUM_RELEASE}`);

  const releaseIds = stableReleases.map((entry) => entry.id).sort(compareDottedVersions);
  const latestIncluded = releaseIds.at(-1);
  if (manifest.latest.release !== latestIncluded) {
    fail(`Manifest latest.release (${manifest.latest.release}) does not match latest included stable release (${latestIncluded})`);
  }

  const rawBytes = Buffer.from(manifestBytes);
  const compressedManifest = gzipSync(rawBytes, { level: 9, mtime: 0 });
  const releaseSet = {
    schemaVersion: 1,
    source: OFFICIAL_MANIFEST_URL,
    snapshotDate,
    minimumIncludedVersion: MINIMUM_RELEASE,
    latestStableRelease: latestIncluded,
    rawManifestSha256: sha256(rawBytes),
    rawManifestByteLength: rawBytes.length,
    compressedManifestSha256: sha256(compressedManifest),
    manifestVersionCount: manifest.versions.length,
    stableReleaseCount: releaseIds.length,
    releaseIds,
  };
  return { compressedManifest, releaseSet };
}

function parseArguments(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!['--input-file', '--snapshot-date', '--write', '--check'].includes(flag)) fail(`Unknown argument: ${flag}`);
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
  if (!values.has('--input-file')) fail('Missing required argument: --input-file');
  return values;
}

async function run() {
  const args = parseArguments(process.argv.slice(2));
  const snapshotDate = args.get('--snapshot-date') ?? DEFAULT_SNAPSHOT_DATE;
  const { compressedManifest, releaseSet } = materializeMojangVersionSnapshot(
    await readFile(resolve(args.get('--input-file'))),
    snapshotDate,
  );
  const manifestPath = resolve(coverageDirectory, `mojang-version-manifest-${snapshotDate}.json.gz`);
  const releaseSetPath = resolve(coverageDirectory, `mojang-version-release-set-${snapshotDate}.json`);
  const releaseSetBytes = Buffer.from(`${JSON.stringify(releaseSet, null, 2)}\n`, 'utf8');

  if (args.has('--write')) {
    await mkdir(dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, compressedManifest);
    await writeFile(releaseSetPath, releaseSetBytes);
  } else {
    const currentManifest = await readFile(manifestPath).catch(() => null);
    const currentReleaseSet = await readFile(releaseSetPath).catch(() => null);
    if (!currentManifest?.equals(compressedManifest)) fail(`Pinned manifest archive is missing or stale: ${manifestPath}`);
    if (!currentReleaseSet?.equals(releaseSetBytes)) fail(`Pinned release set is missing or stale: ${releaseSetPath}`);
  }
  console.log(`${args.has('--write') ? 'Wrote' : 'Verified'} official Mojang release snapshot: ${releaseSet.stableReleaseCount} stable releases ${releaseSet.minimumIncludedVersion}..${releaseSet.latestStableRelease}; raw SHA-256 ${releaseSet.rawManifestSha256}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await run();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
