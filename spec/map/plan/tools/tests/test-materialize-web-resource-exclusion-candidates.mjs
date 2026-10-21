import test from 'node:test';
import assert from 'node:assert/strict';
import { materializeWebResourceExclusionCandidates } from '../materialize-web-resource-exclusion-candidates.mjs';

const revision = '93b454efb8802dc7406d6873434f2aeec5c636f4';
const inventory = (entries) => ({ sourceRevision: revision, entries });
const sourceRow = (sourcePath, suffix) => ({
  sourcePath,
  sourceRevision: revision,
  gitBlobSha1: suffix.repeat(40),
  contentSha256: suffix.repeat(64),
  byteLength: 4,
  scope: 'unclassified',
  scopeStatus: 'pending_source_and_consumer_review',
  consumerSymbolIds: [],
  ownerPhaseId: 'P-001',
  phaseDocument: 'phases/phase-001-resource-closure.md',
  fixturePlanIds: [],
  referencePlanIds: [],
  focusedTestPlanIds: [],
  evidencePlanIds: [],
  exclusionRationale: null,
  exclusionEvidenceIds: [],
  status: 'unclassified',
});

test('plans exclusion for only exact pinned web-prefix rows and leaves global completion open', () => {
  const webA = sourceRow('DynmapCore/src/main/resources/extracted/web/index.html', 'a');
  const webB = sourceRow('DynmapCore/src/main/resources/extracted/web/version.js', 'b');
  const platform = sourceRow('fabric/src/main/resources/fabric.mod.json', 'c');
  const catalog = { sourceRevision: revision, entries: [webA, platform, webB], counts: { total: 3 } };

  const result = materializeWebResourceExclusionCandidates(
    inventory([webA, webB, platform]), catalog, 2,
  );

  assert.equal(result.entries[0].scope, 'excluded');
  assert.equal(result.entries[0].scopeStatus, 'planned_exclusion_pending_global_consumer_closure');
  assert.deepEqual(result.entries[0].consumerSymbolIds, [
    'method:type:org.dynmap.DynmapCore#updateExtractedFiles()',
    'method:type:org.dynmap.DynmapCore#updateStaticWebToStorage()',
  ]);
  assert.deepEqual(result.entries[0].exclusionEvidenceIds, ['SRC-DYNMAP-STATIC-WEB-PUBLISHER']);
  assert.match(result.entries[0].exclusionRationale, /not verified until the complete source\/resource consumer audit/);
  assert.equal(result.entries[1], platform);
  assert.equal(result.entries[2].scope, 'excluded');
  assert.equal(result.classificationComplete, false);
  assert.equal(result.consumerClosureComplete, false);
  assert.equal(result.counts.unclassified, 1);
  assert.equal(result.counts.plannedWebExclusions, 2);
});

test('rejects drift in pinned revision, exact web population, catalog path set, or resource digest', () => {
  const web = sourceRow('DynmapCore/src/main/resources/extracted/web/index.html', 'a');
  const catalog = { sourceRevision: revision, entries: [web] };

  assert.throws(() => materializeWebResourceExclusionCandidates(
    { ...inventory([web]), sourceRevision: 'other' }, catalog, 1,
  ), /unexpected revision/);
  assert.throws(() => materializeWebResourceExclusionCandidates(
    inventory([web]), catalog, 2,
  ), /count changed/);
  assert.throws(() => materializeWebResourceExclusionCandidates(
    inventory([web]), { sourceRevision: revision, entries: [] }, 1,
  ), /path set differs/);
  assert.throws(() => materializeWebResourceExclusionCandidates(
    inventory([{ ...web, contentSha256: 'f'.repeat(64) }]), catalog, 1,
  ), /identity differs/);
});

test('refuses to replace an independently classified renderer resource', () => {
  const web = sourceRow('DynmapCore/src/main/resources/extracted/web/index.html', 'a');
  const classified = { ...web, scope: 'renderer-runtime' };
  assert.throws(() => materializeWebResourceExclusionCandidates(
    inventory([web]), { sourceRevision: revision, entries: [classified] }, 1,
  ), /Refusing to overwrite/);
});
