import assert from 'node:assert/strict';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import {
  materializeMojangVersionSnapshot,
  compareDottedVersions,
} from '../materialize-mojang-version-snapshot.mjs';

const entry = (id, type = 'release') => ({
  id,
  type,
  url: `https://example.invalid/${id}.json`,
  time: '2026-09-23T00:00:00+00:00',
  releaseTime: '2026-09-23T00:00:00+00:00',
});

const fixtureBytes = () => Buffer.from(`${JSON.stringify({
  latest: { release: '26.1' },
  versions: [
    entry('1.13.2'),
    entry('1.14'),
    entry('1.14.1'),
    entry('1.15'),
    entry('26.1-snapshot', 'snapshot'),
    entry('26.1'),
  ],
})}\n`);

test('selects every exact stable release at or above the minimum in numeric order', () => {
  const { releaseSet, compressedManifest } = materializeMojangVersionSnapshot(fixtureBytes());
  assert.deepEqual(releaseSet.releaseIds, ['1.14', '1.14.1', '1.15', '26.1']);
  assert.equal(releaseSet.minimumIncludedVersion, '1.14');
  assert.equal(releaseSet.latestStableRelease, '26.1');
  assert.equal(releaseSet.stableReleaseCount, 4);
  assert.equal(releaseSet.rawManifestByteLength, fixtureBytes().length);
  assert.equal(gunzipSync(compressedManifest).toString('utf8'), fixtureBytes().toString('utf8'));
});

test('rejects duplicate release IDs and a latest.release mismatch', () => {
  const duplicate = JSON.parse(fixtureBytes());
  duplicate.versions.push(entry('1.14'));
  assert.throws(
    () => materializeMojangVersionSnapshot(Buffer.from(JSON.stringify(duplicate))),
    /Duplicate stable release ID/,
  );

  const mismatch = JSON.parse(fixtureBytes());
  mismatch.latest.release = '1.15';
  assert.throws(
    () => materializeMojangVersionSnapshot(Buffer.from(JSON.stringify(mismatch))),
    /does not match latest included stable release/,
  );
});

test('rejects malformed JSON and incomplete stable release metadata', () => {
  assert.throws(() => materializeMojangVersionSnapshot(Buffer.from('{')), /not valid UTF-8 JSON/);
  const incomplete = JSON.parse(fixtureBytes());
  incomplete.versions.find((version) => version.id === '1.15').releaseTime = undefined;
  assert.throws(
    () => materializeMojangVersionSnapshot(Buffer.from(JSON.stringify(incomplete))),
    /metadata is incomplete: 1.15/,
  );
});

test('uses semantic numeric dotted-version ordering', () => {
  assert.ok(compareDottedVersions('1.9.4', '1.10') < 0);
  assert.ok(compareDottedVersions('26.1.2', '26.2') < 0);
});
