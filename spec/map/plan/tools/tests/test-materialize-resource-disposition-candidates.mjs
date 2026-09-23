import test from 'node:test';
import assert from 'node:assert/strict';
import { materializeResourceDispositionCandidates } from '../materialize-resource-disposition-candidates.mjs';

const revision = '93b454efb8802dc7406d6873434f2aeec5c636f4';
const inventory = (entries) => ({
  sourceRepository: 'https://github.com/webbukkit/dynmap',
  sourceRevision: revision,
  sourceTreeSha1: '632ec26b9f995c8c7acaf525325b359a8a996175',
  entries,
});
const row = (sourcePath, suffix) => ({
  sourcePath,
  gitBlobSha1: suffix.repeat(40),
  contentSha256: suffix.repeat(64),
  byteLength: 4,
});

test('materializes the exact full pinned resource path set and keeps unresolved facts open', () => {
  const result = materializeResourceDispositionCandidates(
    inventory([row('DynmapCore/src/main/resources/a.txt', 'a'), row('fabric/src/main/resources/b.json', 'b')]),
    { entries: [{ sourcePath: 'DynmapCore/src/main/resources/a.txt', scope: 'renderer-asset' }] },
  );

  assert.deepEqual(result.entries.map((entry) => entry.sourcePath), [
    'DynmapCore/src/main/resources/a.txt',
    'fabric/src/main/resources/b.json',
  ]);
  assert.equal(result.entries[0].candidateScope, 'renderer-asset');
  assert.equal(result.entries[1].candidateScope, null);
  assert.ok(result.entries.every((entry) => entry.scope === 'unclassified'));
  assert.ok(result.entries.every((entry) => entry.license === null));
  assert.equal(result.classificationComplete, false);
  assert.equal(result.consumerClosureComplete, false);
  assert.equal(result.counts.newlyAddedFromPinnedInventory, 1);
  const regenerated = materializeResourceDispositionCandidates(
    inventory([row('DynmapCore/src/main/resources/a.txt', 'a'), row('fabric/src/main/resources/b.json', 'b')]),
    result,
  );
  assert.deepEqual(regenerated.entries, result.entries);
});

test('rejects duplicate paths, malformed digests, and catalogs outside the pinned inventory', () => {
  assert.throws(() => materializeResourceDispositionCandidates(
    inventory([row('duplicate', 'a'), row('duplicate', 'b')]),
  ), /invalid row/);
  assert.throws(() => materializeResourceDispositionCandidates(
    inventory([{ ...row('bad-hash', 'a'), contentSha256: 'invalid' }]),
  ), /invalid row/);
  assert.throws(() => materializeResourceDispositionCandidates(
    inventory([row('known', 'a')]),
    { entries: [{ sourcePath: 'not-in-pinned-tree' }] },
  ), /outside the pinned inventory/);
});
