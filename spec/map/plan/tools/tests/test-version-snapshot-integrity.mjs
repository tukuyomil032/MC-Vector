import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { materializeMojangVersionSnapshot } from '../materialize-mojang-version-snapshot.mjs';
import { verifyVersionSnapshot } from '../version-snapshot-integrity.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const release = (id, url) => ({
  id,
  type: 'release',
  url,
  time: '2026-09-23T00:00:00+00:00',
  releaseTime: '2026-09-23T00:00:00+00:00',
});

function validInputs() {
  const raw = Buffer.from(`${JSON.stringify({
    latest: { release: '1.14.1' },
    versions: [release('1.14', 'https://example.invalid/1.14.json'), release('1.14.1', 'https://example.invalid/1.14.1.json')],
  })}\n`);
  const { compressedManifest, releaseSet } = materializeMojangVersionSnapshot(raw, '2026-09-23');
  const releaseSetBytes = Buffer.from(`${JSON.stringify(releaseSet, null, 2)}\n`);
  const versionMatrix = {
    snapshotDate: '2026-09-23',
    officialManifestSnapshot: {
      compressedArchiveSha256: sha256(compressedManifest),
      releaseSetSha256: sha256(releaseSetBytes),
      rawManifestSha256: sha256(raw),
      rawManifestByteLength: raw.length,
      stableReleaseCount: 2,
    },
    entries: releaseSet.releaseIds.map((id) => ({
      minecraftVersion: id,
      officialVersionManifestEntry: `https://example.invalid/${id}.json`,
      releaseTime: '2026-09-23T00:00:00+00:00',
    })),
  };
  return { raw, compressedManifest, releaseSetBytes, versionMatrix };
}

test('accepts an exact matrix match to the archived official release set', () => {
  assert.deepEqual(verifyVersionSnapshot(validInputs()), []);
});

test('validates the archived gzip digest without requiring identical recompression bytes', () => {
  const input = validInputs();
  input.compressedManifest = gzipSync(input.raw, { level: 1, mtime: 0 });
  const releaseSet = JSON.parse(input.releaseSetBytes.toString('utf8'));
  releaseSet.compressedManifestSha256 = sha256(input.compressedManifest);
  input.releaseSetBytes = Buffer.from(`${JSON.stringify(releaseSet, null, 2)}\n`);
  input.versionMatrix.officialManifestSnapshot.compressedArchiveSha256 = sha256(input.compressedManifest);
  input.versionMatrix.officialManifestSnapshot.releaseSetSha256 = sha256(input.releaseSetBytes);

  assert.deepEqual(verifyVersionSnapshot(input), []);
});

test('rejects a missing or extra exact release in the version matrix', () => {
  const input = validInputs();
  input.versionMatrix.entries.pop();
  assert.ok(verifyVersionSnapshot(input).includes('version matrix exact release IDs do not match the official stable release set'));
});

test('rejects forged official URLs, stale archive hashes, and nonmatching release-set contents', () => {
  const urlMismatch = validInputs();
  urlMismatch.versionMatrix.entries[0].officialVersionManifestEntry = 'https://example.invalid/forged.json';
  assert.ok(verifyVersionSnapshot(urlMismatch).some((error) => error.includes('official version JSON URL mismatch')));

  const hashMismatch = validInputs();
  hashMismatch.compressedManifest = Buffer.from('not the pinned archive');
  assert.ok(verifyVersionSnapshot(hashMismatch).some((error) => error.includes('compressed official manifest SHA-256 mismatch')));

  const releaseSetMismatch = validInputs();
  const changed = JSON.parse(releaseSetMismatch.releaseSetBytes.toString('utf8'));
  changed.releaseIds.pop();
  releaseSetMismatch.releaseSetBytes = Buffer.from(`${JSON.stringify(changed, null, 2)}\n`);
  assert.ok(verifyVersionSnapshot(releaseSetMismatch).some((error) => error.includes('release-set IDs do not match')));
});
