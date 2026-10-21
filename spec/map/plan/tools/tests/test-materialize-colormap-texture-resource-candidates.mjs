import test from 'node:test';
import assert from 'node:assert/strict';
import { materializeColormapTextureResourceCandidates } from '../materialize-colormap-texture-resource-candidates.mjs';

const revision = '93b454efb8802dc7406d6873434f2aeec5c636f4';
const tree = '632ec26b9f995c8c7acaf525325b359a8a996175';
const root = 'DynmapCore/src/main/resources/texturepacks/standard/assets/minecraft/textures/colormap/';
const sourcePath = 'DynmapCore/src/main/java/org/dynmap/hdmap/TexturePack.java';
const loaderPath = 'DynmapCore/src/main/java/org/dynmap/hdmap/TexturePackLoader.java';
const fields = [
  ['field:type:org.dynmap.hdmap.TexturePack#GRASSCOLOR_RP_PNG', 'grass.png', 70],
  ['field:type:org.dynmap.hdmap.TexturePack#FOLIAGECOLOR_RP_PNG', 'foliage.png', 72],
];
const consumers = [
  'constructor:type:org.dynmap.hdmap.TexturePack#%3cinit%3e(DynmapCore,String)',
  'method:type:org.dynmap.hdmap.TexturePack#loadBiomeShadingImage(InputStream,int,String,String)',
  'method:type:org.dynmap.hdmap.TexturePackLoader#openTPResource(String,String)',
  'method:type:org.dynmap.hdmap.TexturePackLoader#openModTPResource(String,String)',
];
const ast = () => ({
  sourceRevision: revision,
  sourceRevisionProvenance: 'verified_against_git_commit_and_java_blob_ids',
  sourceTreeSha1: tree,
  counts: { declarations: fields.length + consumers.length, parseErrors: 0 },
  declarations: [
    ...fields.map(([symbolId, name, line]) => ({
      symbolId,
      kind: 'field',
      sourcePath,
      startLine: line,
      endLine: line,
      initializer: JSON.stringify(`assets/minecraft/textures/colormap/${name}`),
    })),
    ...consumers.map((symbolId) => ({
      symbolId,
      sourcePath: symbolId.includes('TexturePackLoader#') ? loaderPath : sourcePath,
    })),
  ],
});
const resources = fields.map(([,,], index) => {
  const name = index === 0 ? 'grass.png' : 'foliage.png';
  const suffix = index === 0 ? 'a' : 'b';
  return {
    sourcePath: `${root}${name}`,
    sourceRevision: revision,
    gitBlobSha1: suffix.repeat(40),
    contentSha256: suffix.repeat(64),
    byteLength: 10,
  };
});
const inventory = { sourceRevision: revision, sourceTreeSha1: tree, entries: resources };
const catalog = {
  sourceRevision: revision,
  classificationComplete: false,
  consumerClosureComplete: false,
  counts: { total: resources.length, unclassified: resources.length, licenseUnverified: resources.length },
  entries: resources.map((entry) => ({
    ...entry,
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
};

test('maps exact grass and foliage colormap constants to renderer consumers without license claims', () => {
  const result = materializeColormapTextureResourceCandidates(ast(), inventory, catalog);
  assert.equal(result.counts.plannedLegacyBiomeColormapRuntime, 2);
  assert.equal(result.counts.unclassified, 0);
  for (const entry of result.entries) {
    assert.equal(entry.scope, 'renderer-runtime');
    assert.equal(entry.scopeStatus, 'planned_renderer_runtime_pending_license_and_global_closure');
    assert.equal(entry.ownerPhaseId, 'P-016');
    assert.equal(entry.licenseStatus, 'unverified_per_resource');
    assert.equal(entry.fixturePlanIds.length, 1);
    assert.equal(entry.referencePlanIds.length, 1);
    assert.equal(entry.focusedTestPlanIds.length, 1);
  }
  assert.equal(result.classificationComplete, false);
  assert.equal(result.consumerClosureComplete, false);
});

test('rejects an AST path or pinned resource digest mismatch', () => {
  const changedAst = ast();
  changedAst.declarations[0].initializer = '"assets/minecraft/textures/block/grass.png"';
  assert.throws(
    () => materializeColormapTextureResourceCandidates(changedAst, inventory, catalog),
    /field changed/,
  );

  const changedCatalog = structuredClone(catalog);
  changedCatalog.entries[0].contentSha256 = 'f'.repeat(64);
  assert.throws(
    () => materializeColormapTextureResourceCandidates(ast(), inventory, changedCatalog),
    /identity differs from pinned bytes/,
  );
});
