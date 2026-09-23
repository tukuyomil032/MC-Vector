import test from 'node:test';
import assert from 'node:assert/strict';
import { materializeResourceCatalogCandidates } from '../materialize-resource-catalog-candidates.mjs';

const revision = '93b454efb8802dc7406d6873434f2aeec5c636f4';
const tree = '632ec26b9f995c8c7acaf525325b359a8a996175';
const resource = (sourcePath, suffix) => ({
  sourcePath,
  gitBlobSha1: suffix.repeat(40),
  contentSha256: suffix.repeat(64),
  byteLength: 3,
  mode: '100644',
});
const inventory = (entries) => ({
  sourceRepository: 'https://github.com/webbukkit/dynmap',
  sourceRevision: revision,
  sourceTreeSha1: tree,
  entries,
});
const catalogRow = (item) => ({
  ...item,
  sourceRevision: revision,
  candidateScope: null,
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
});
const texturePackAst = {
  sourceRevision: revision,
  sourceRevisionProvenance: 'verified_against_git_commit_and_java_blob_ids',
  sourceTreeSha1: tree,
  counts: { declarations: 13, parseErrors: 0 },
  declarations: [
    {
      symbolId: 'field:type:org.dynmap.hdmap.TexturePack#GRASSCOLOR_RP_PNG',
      kind: 'field',
      sourcePath: 'DynmapCore/src/main/java/org/dynmap/hdmap/TexturePack.java',
      startLine: 70,
      endLine: 70,
      initializer: '"assets/minecraft/textures/colormap/grass.png"',
    },
    {
      symbolId: 'field:type:org.dynmap.hdmap.TexturePack#FOLIAGECOLOR_RP_PNG',
      kind: 'field',
      sourcePath: 'DynmapCore/src/main/java/org/dynmap/hdmap/TexturePack.java',
      startLine: 72,
      endLine: 72,
      initializer: '"assets/minecraft/textures/colormap/foliage.png"',
    },
    {
      symbolId: 'field:type:org.dynmap.hdmap.TexturePack#terrain_rp_map',
      kind: 'field',
      signature: 'org.dynmap.hdmap.TexturePack#terrain_rp_map:String[]',
      sourcePath: 'DynmapCore/src/main/java/org/dynmap/hdmap/TexturePack.java',
      startLine: 280,
      endLine: 316,
      initializer: '{"stone"}',
    },
    ...[
      'method:type:org.dynmap.hdmap.TexturePack#getRPFileName(int)',
      'method:type:org.dynmap.hdmap.TexturePack#resetFiles()',
      'constructor:type:org.dynmap.hdmap.TexturePack#%3cinit%3e(DynmapCore,String)',
      'method:type:org.dynmap.hdmap.TexturePack#loadTerrain(boolean)',
      'method:type:org.dynmap.hdmap.TexturePack#loadImage(InputStream,int,String,String)',
      'method:type:org.dynmap.hdmap.TexturePack#findOrAddDynamicTileFile(String,String,int,int,TileFileFormat,String%5b%5d)',
      'method:type:org.dynmap.hdmap.TexturePack#loadBiomeShadingImage(InputStream,int,String,String)',
      'method:type:org.dynmap.hdmap.TexturePackLoader#openTPResource(String)',
      'method:type:org.dynmap.hdmap.TexturePackLoader#openTPResource(String,String)',
      'method:type:org.dynmap.hdmap.TexturePackLoader#openModTPResource(String,String)',
    ].map((symbolId) => ({
      symbolId,
      sourcePath: symbolId.includes('TexturePackLoader#')
        ? 'DynmapCore/src/main/java/org/dynmap/hdmap/TexturePackLoader.java'
        : 'DynmapCore/src/main/java/org/dynmap/hdmap/TexturePack.java',
    })),
  ],
};

test('composes a deterministic full-path candidate catalog without claiming global closure', () => {
  const web = resource('DynmapCore/src/main/resources/extracted/web/index.html', 'a');
  const asset = resource('DynmapCore/src/main/resources/texturepacks/standard/terrain.png', 'b');
  const colorScheme = resource('DynmapCore/src/main/resources/extracted/colorschemes/default.txt', 'd');
  const terrainTexture = resource(
    'DynmapCore/src/main/resources/texturepacks/standard/assets/minecraft/textures/blocks/stone.png',
    'e',
  );
  const grassColormap = resource(
    'DynmapCore/src/main/resources/texturepacks/standard/assets/minecraft/textures/colormap/grass.png',
    'f',
  );
  const foliageColormap = resource(
    'DynmapCore/src/main/resources/texturepacks/standard/assets/minecraft/textures/colormap/foliage.png',
    '8',
  );
  const rows = [
    catalogRow(web),
    catalogRow(asset),
    catalogRow(colorScheme),
    catalogRow(terrainTexture),
    catalogRow(grassColormap),
    catalogRow(foliageColormap),
  ];
  const source = inventory([web, asset, colorScheme, terrainTexture, grassColormap, foliageColormap]);
  const digest = 'c'.repeat(64);

  const result = materializeResourceCatalogCandidates(
    source,
    { sourceRevision: revision, entries: rows },
    digest,
    texturePackAst,
    1,
    1,
    1,
    1,
  );

  assert.equal(result.generatedBy, 'spec/map/plan/tools/materialize-resource-catalog-candidates.mjs');
  assert.equal(result.inventorySha256, digest);
  const byPath = new Map(result.entries.map((entry) => [entry.sourcePath, entry]));
  assert.equal(byPath.get(web.sourcePath).scope, 'excluded');
  assert.equal(byPath.get(asset.sourcePath).scope, 'unclassified');
  assert.equal(byPath.get(colorScheme.sourcePath).scope, 'renderer-runtime');
  assert.equal(byPath.get(colorScheme.sourcePath).ownerPhaseId, 'P-016');
  assert.equal(byPath.get(terrainTexture.sourcePath).scope, 'renderer-runtime');
  assert.equal(byPath.get(terrainTexture.sourcePath).ownerPhaseId, 'P-014');
  assert.equal(byPath.get(terrainTexture.sourcePath).fixturePlanIds.length, 1);
  assert.equal(byPath.get(terrainTexture.sourcePath).licenseStatus, 'unverified_per_resource');
  for (const colormap of [grassColormap, foliageColormap]) {
    assert.equal(byPath.get(colormap.sourcePath).scope, 'renderer-runtime');
    assert.equal(byPath.get(colormap.sourcePath).ownerPhaseId, 'P-016');
    assert.equal(byPath.get(colormap.sourcePath).fixturePlanIds.length, 1);
    assert.equal(byPath.get(colormap.sourcePath).licenseStatus, 'unverified_per_resource');
  }
  assert.equal(result.counts.plannedWebExclusions, 1);
  assert.equal(result.counts.plannedColorSchemeRuntime, 1);
  assert.equal(result.counts.plannedLegacyTerrainRuntime, 1);
  assert.equal(result.counts.plannedLegacyBiomeColormapRuntime, 2);
  assert.equal(result.counts.unclassified, 1);
  assert.equal(result.classificationComplete, false);
  assert.equal(result.consumerClosureComplete, false);
  assert.deepEqual(
    materializeResourceCatalogCandidates(source, { ...result }, digest, texturePackAst, 1, 1, 1, 1),
    result,
  );
});

test('rejects an absent or malformed inventory digest', () => {
  assert.throws(() => materializeResourceCatalogCandidates(inventory([]), { entries: [] }, 'bad'), /SHA-256 is invalid/);
});
