import test from 'node:test';
import assert from 'node:assert/strict';
import { materializeLegacyTerrainResourceCandidates } from '../materialize-legacy-terrain-resource-candidates.mjs';

const revision = '93b454efb8802dc7406d6873434f2aeec5c636f4';
const tree = '632ec26b9f995c8c7acaf525325b359a8a996175';
const textureRoot = 'DynmapCore/src/main/resources/texturepacks/standard/assets/minecraft/textures/blocks/';
const sourceNames = [
  'method:type:org.dynmap.hdmap.TexturePack#getRPFileName(int)',
  'method:type:org.dynmap.hdmap.TexturePack#resetFiles()',
  'constructor:type:org.dynmap.hdmap.TexturePack#%3cinit%3e(DynmapCore,String)',
  'method:type:org.dynmap.hdmap.TexturePack#loadTerrain(boolean)',
  'method:type:org.dynmap.hdmap.TexturePack#loadImage(InputStream,int,String,String)',
  'method:type:org.dynmap.hdmap.TexturePack#findOrAddDynamicTileFile(String,String,int,int,TileFileFormat,String%5b%5d)',
  'method:type:org.dynmap.hdmap.TexturePackLoader#openTPResource(String)',
  'method:type:org.dynmap.hdmap.TexturePackLoader#openModTPResource(String,String)',
];

const ast = (names) => ({
  sourceRevision: revision,
  sourceRevisionProvenance: 'verified_against_git_commit_and_java_blob_ids',
  sourceTreeSha1: tree,
  counts: { declarations: 1 + sourceNames.length, parseErrors: 0 },
  declarations: [
    {
      symbolId: 'field:type:org.dynmap.hdmap.TexturePack#terrain_rp_map',
      kind: 'field',
      signature: 'org.dynmap.hdmap.TexturePack#terrain_rp_map:String[]',
      sourcePath: 'DynmapCore/src/main/java/org/dynmap/hdmap/TexturePack.java',
      startLine: 280,
      endLine: 316,
      initializer: `{${names.map((name) => JSON.stringify(name)).join(', ')}}`,
    },
    ...sourceNames.map((symbolId) => ({
      symbolId,
      sourcePath: symbolId.includes('TexturePackLoader#')
        ? 'DynmapCore/src/main/java/org/dynmap/hdmap/TexturePackLoader.java'
        : 'DynmapCore/src/main/java/org/dynmap/hdmap/TexturePack.java',
    })),
  ],
});

const resource = (name, suffix) => ({
  sourcePath: `${textureRoot}${name}.png`,
  sourceRevision: revision,
  gitBlobSha1: suffix.repeat(40),
  contentSha256: suffix.repeat(64),
  byteLength: 8,
});
const inventory = (entries) => ({ sourceRevision: revision, sourceTreeSha1: tree, entries });
const catalog = (entries) => ({
  sourceRevision: revision,
  classificationComplete: false,
  consumerClosureComplete: false,
  counts: { total: entries.length, unclassified: entries.length, licenseUnverified: entries.length },
  entries: entries.map((entry) => ({
    ...entry,
    candidateScope: 'renderer-asset',
    scope: 'unclassified',
    scopeStatus: 'pending_source_and_consumer_review',
    license: null,
    licenseStatus: 'unverified_per_resource',
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
    implementationStatus: 'not_started',
  })),
});

test('maps every unique exact legacy terrain filename to P-014 without claiming license or global closure', () => {
  const entries = [resource('stone', 'a'), resource('grass_top', 'b')];
  const result = materializeLegacyTerrainResourceCandidates(
    ast(['stone', null, 'stone', 'grass_top']),
    inventory(entries),
    catalog(entries),
    { expectedSlotCount: 4, expectedUniqueResourceCount: 2 },
  );

  assert.equal(result.counts.legacyTerrainMappingSlots, 4);
  assert.equal(result.counts.legacyTerrainNonNullSlots, 3);
  assert.equal(result.counts.plannedLegacyTerrainRuntime, 2);
  for (const entry of result.entries) {
    assert.equal(entry.scope, 'renderer-runtime');
    assert.equal(entry.ownerPhaseId, 'P-014');
    assert.deepEqual(entry.consumerSymbolIds, [
      'field:type:org.dynmap.hdmap.TexturePack#terrain_rp_map',
      ...sourceNames,
    ]);
    assert.equal(entry.fixturePlanIds.length, 1);
    assert.equal(entry.referencePlanIds.length, 1);
    assert.equal(entry.focusedTestPlanIds.length, 1);
    assert.equal(entry.licenseStatus, 'unverified_per_resource');
  }
  assert.equal(result.classificationComplete, false);
  assert.equal(result.consumerClosureComplete, false);
});

test('rejects a mapped filename with no pinned resource row', () => {
  const entries = [resource('stone', 'a')];
  assert.throws(
    () => materializeLegacyTerrainResourceCandidates(
      ast(['stone', 'missing'] ), inventory(entries), catalog(entries),
      { expectedSlotCount: 2, expectedUniqueResourceCount: 2 },
    ),
    /references a missing resource/,
  );
});

test('rejects modified source declaration span and pinned byte drift', () => {
  const entries = [resource('stone', 'a')];
  const changedAst = ast(['stone']);
  changedAst.declarations[0].startLine += 1;
  assert.throws(
    () => materializeLegacyTerrainResourceCandidates(
      changedAst, inventory(entries), catalog(entries),
      { expectedSlotCount: 1, expectedUniqueResourceCount: 1 },
    ),
    /declaration differs from the audited source span/,
  );

  const changedCatalog = catalog(entries);
  changedCatalog.entries[0].contentSha256 = 'f'.repeat(64);
  assert.throws(
    () => materializeLegacyTerrainResourceCandidates(
      ast(['stone']), inventory(entries), changedCatalog,
      { expectedSlotCount: 1, expectedUniqueResourceCount: 1 },
    ),
    /identity differs from pinned bytes/,
  );
});
