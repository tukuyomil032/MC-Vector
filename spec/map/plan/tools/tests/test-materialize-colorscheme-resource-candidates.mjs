import test from 'node:test';
import assert from 'node:assert/strict';
import { materializeColorSchemeResourceCandidates } from '../materialize-colorscheme-resource-candidates.mjs';

const revision = '93b454efb8802dc7406d6873434f2aeec5c636f4';
const resource = (sourcePath, suffix) => ({
  sourcePath,
  sourceRevision: revision,
  gitBlobSha1: suffix.repeat(40),
  contentSha256: suffix.repeat(64),
  byteLength: 4,
  license: null,
  licenseStatus: 'unverified_per_resource',
  scope: 'unclassified',
  consumerSymbolIds: [],
});
const inventory = (entries) => ({ sourceRevision: revision, entries });
const catalog = (entries) => ({
  sourceRevision: revision,
  classificationComplete: false,
  consumerClosureComplete: false,
  counts: { total: entries.length, unclassified: entries.length, licenseUnverified: entries.length },
  entries: entries.map((entry) => ({
    ...entry,
    candidateScope: 'platform-or-administration',
    scopeStatus: 'pending_source_and_consumer_review',
    ownerPhaseId: 'P-001',
    phaseDocument: 'phases/phase-001-resource-closure.md',
    fixturePlanIds: [],
    referencePlanIds: [],
    focusedTestPlanIds: [],
    evidencePlanIds: [],
    exclusionRationale: null,
    exclusionEvidenceIds: [],
    status: 'unclassified',
    implementationStatus: 'not_started',
  })),
});

test('maps pinned color-scheme paths to renderer consumers without claiming license or global closure', () => {
  const paths = [
    'DynmapCore/src/main/resources/extracted/colorschemes/default.txt',
    'DynmapCore/src/main/resources/extracted/colorschemes/biome_rainfall_temp.txt',
  ];
  const rows = paths.map((path, index) => resource(path, index === 0 ? 'a' : 'b'));
  const result = materializeColorSchemeResourceCandidates(inventory(rows), catalog(rows), 2);

  assert.equal(result.entries.length, 2);
  for (const entry of result.entries) {
    assert.equal(entry.scope, 'renderer-runtime');
    assert.equal(entry.scopeStatus, 'planned_renderer_runtime_pending_license_and_global_closure');
    assert.equal(entry.ownerPhaseId, 'P-016');
    assert.equal(entry.consumerSymbolIds.includes('method:type:org.dynmap.ColorScheme#loadScheme(DynmapCore,String)'), true);
    assert.equal(entry.fixturePlanIds.length, 1);
    assert.equal(entry.referencePlanIds.length, 1);
    assert.equal(entry.focusedTestPlanIds.length, 1);
    assert.equal(entry.licenseStatus, 'unverified_per_resource');
  }
  assert.equal(result.classificationComplete, false);
  assert.equal(result.consumerClosureComplete, false);
  assert.equal(result.counts.unclassified, 0);
});

test('rejects pinned resource byte drift and unexpected family size', () => {
  const row = resource('DynmapCore/src/main/resources/extracted/colorschemes/default.txt', 'a');
  const changed = { ...row, contentSha256: 'f'.repeat(64) };
  assert.throws(
    () => materializeColorSchemeResourceCandidates(inventory([row]), catalog([changed]), 1),
    /identity differs from pinned bytes/,
  );
  assert.throws(
    () => materializeColorSchemeResourceCandidates(inventory([row]), catalog([row]), 12),
    /count changed/,
  );
});

test('does not overwrite an independently classified color-scheme resource', () => {
  const row = resource('DynmapCore/src/main/resources/extracted/colorschemes/custom.txt', 'a');
  const reviewed = catalog([row]);
  reviewed.entries[0].scope = 'boundary-adapter';
  assert.throws(
    () => materializeColorSchemeResourceCandidates(inventory([row]), reviewed, 1),
    /Refusing to overwrite an independently reviewed resource disposition/,
  );
});
