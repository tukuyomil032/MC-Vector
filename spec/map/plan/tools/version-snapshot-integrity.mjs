import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import {
  OFFICIAL_MANIFEST_URL,
  compareDottedVersions,
  materializeMojangVersionSnapshot,
} from './materialize-mojang-version-snapshot.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sameArray = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export function verifyVersionSnapshot({ compressedManifest, releaseSetBytes, versionMatrix }) {
  const errors = [];
  const snapshot = versionMatrix.officialManifestSnapshot;
  if (!snapshot) return ['version matrix has no pinned officialManifestSnapshot'];
  const add = (condition, message) => { if (!condition) errors.push(message); };
  const compressedBytes = Buffer.from(compressedManifest);
  const releaseBytes = Buffer.from(releaseSetBytes);
  add(sha256(compressedBytes) === snapshot.compressedArchiveSha256, 'compressed official manifest SHA-256 mismatch');
  add(sha256(releaseBytes) === snapshot.releaseSetSha256, 'official release-set file SHA-256 mismatch');

  let rawManifest;
  let releaseSet;
  try {
    rawManifest = gunzipSync(compressedBytes);
  } catch {
    return [...errors, 'official manifest archive is not valid gzip'];
  }
  try {
    releaseSet = JSON.parse(releaseBytes.toString('utf8'));
  } catch {
    return [...errors, 'official release-set file is not valid JSON'];
  }
  add(sha256(rawManifest) === snapshot.rawManifestSha256, 'raw official manifest SHA-256 mismatch');
  add(rawManifest.length === snapshot.rawManifestByteLength, 'raw official manifest byte length mismatch');

  let materialized;
  try {
    materialized = materializeMojangVersionSnapshot(rawManifest, versionMatrix.snapshotDate).releaseSet;
  } catch (error) {
    return [...errors, `official manifest cannot be materialized: ${error.message}`];
  }
  add(materialized.source === OFFICIAL_MANIFEST_URL, 'release set source is not the official Mojang manifest');
  add(releaseSet.source === OFFICIAL_MANIFEST_URL, 'pinned release-set source is not the official Mojang manifest');
  add(releaseSet.snapshotDate === versionMatrix.snapshotDate, 'pinned release-set date does not match version matrix');
  add(materialized.rawManifestSha256 === releaseSet.rawManifestSha256, 'release-set raw manifest hash does not match archived manifest');
  add(sha256(compressedBytes) === releaseSet.compressedManifestSha256, 'release-set compressed archive hash does not match the archived bytes');
  add(materialized.stableReleaseCount === snapshot.stableReleaseCount, 'official stable release count does not match version matrix snapshot');
  add(sameArray(materialized.releaseIds, releaseSet.releaseIds), 'release-set IDs do not match the archived official manifest');

  const matrixIds = versionMatrix.entries.map((entry) => entry.minecraftVersion).sort(compareDottedVersions);
  const releaseIds = materialized.releaseIds.toSorted(compareDottedVersions);
  add(sameArray(matrixIds, releaseIds), 'version matrix exact release IDs do not match the official stable release set');
  const officialById = new Map(JSON.parse(rawManifest.toString('utf8')).versions.map((entry) => [entry.id, entry]));
  for (const entry of versionMatrix.entries) {
    const official = officialById.get(entry.minecraftVersion);
    add(Boolean(official && official.type === 'release'), `official manifest stable release is missing: ${entry.minecraftVersion}`);
    if (!official) continue;
    add(official.url === entry.officialVersionManifestEntry, `official version JSON URL mismatch: ${entry.minecraftVersion}`);
    add(official.releaseTime === entry.releaseTime, `official release time mismatch: ${entry.minecraftVersion}`);
  }
  return errors;
}
