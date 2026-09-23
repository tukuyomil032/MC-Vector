import { createHash } from 'node:crypto';

const PINNED_REVISION = '93b454efb8802dc7406d6873434f2aeec5c636f4';
const SCOPE_STATUS = 'planned_renderer_runtime_pending_license_and_global_closure';
const SOURCE_IDS = [
  'field:type:org.dynmap.hdmap.TexturePack#GRASSCOLOR_RP_PNG',
  'field:type:org.dynmap.hdmap.TexturePack#FOLIAGECOLOR_RP_PNG',
];
const CONSUMERS = [
  ...SOURCE_IDS,
  'constructor:type:org.dynmap.hdmap.TexturePack#%3cinit%3e(DynmapCore,String)',
  'method:type:org.dynmap.hdmap.TexturePack#loadBiomeShadingImage(InputStream,int,String,String)',
  'method:type:org.dynmap.hdmap.TexturePackLoader#openTPResource(String,String)',
  'method:type:org.dynmap.hdmap.TexturePackLoader#openModTPResource(String,String)',
];
const EXPECTED = new Map([
  ['field:type:org.dynmap.hdmap.TexturePack#GRASSCOLOR_RP_PNG', {
    sourcePath: 'DynmapCore/src/main/java/org/dynmap/hdmap/TexturePack.java',
    startLine: 70,
    endLine: 70,
    initializer: '"assets/minecraft/textures/colormap/grass.png"',
  }],
  ['field:type:org.dynmap.hdmap.TexturePack#FOLIAGECOLOR_RP_PNG', {
    sourcePath: 'DynmapCore/src/main/java/org/dynmap/hdmap/TexturePack.java',
    startLine: 72,
    endLine: 72,
    initializer: '"assets/minecraft/textures/colormap/foliage.png"',
  }],
]);

const fail = (message) => { throw new Error(message); };
const pathDigest = (sourcePath) => createHash('sha256').update(sourcePath).digest('hex').slice(0, 20);

export function materializeColormapTextureResourceCandidates(astInventory, inventory, catalog) {
  if (astInventory?.sourceRevision !== PINNED_REVISION
      || astInventory?.sourceRevisionProvenance !== 'verified_against_git_commit_and_java_blob_ids'
      || astInventory?.sourceTreeSha1 !== inventory?.sourceTreeSha1
      || !Array.isArray(astInventory.declarations)
      || astInventory?.counts?.parseErrors !== 0
      || astInventory?.counts?.declarations !== astInventory.declarations.length) {
    fail('Pinned Java AST inventory is missing or has an unexpected revision');
  }
  if (inventory?.sourceRevision !== PINNED_REVISION || !Array.isArray(inventory.entries)
      || catalog?.sourceRevision !== PINNED_REVISION || !Array.isArray(catalog.entries)) {
    fail('Pinned resource inventory or catalog is missing or has an unexpected revision');
  }

  const declarations = new Map();
  for (const declaration of astInventory.declarations) {
    if (typeof declaration.symbolId !== 'string' || declarations.has(declaration.symbolId)) {
      fail('Pinned AST has a missing or duplicate declaration ID');
    }
    declarations.set(declaration.symbolId, declaration);
  }
  for (const [symbolId, expected] of EXPECTED) {
    const declaration = declarations.get(symbolId);
    if (declaration?.kind !== 'field'
        || declaration.sourcePath !== expected.sourcePath
        || declaration.startLine !== expected.startLine
        || declaration.endLine !== expected.endLine
        || declaration.initializer !== expected.initializer) {
      fail(`Pinned colormap resource field changed: ${symbolId}`);
    }
  }
  for (const symbolId of CONSUMERS.slice(SOURCE_IDS.length)) {
    const declaration = declarations.get(symbolId);
    const expectedPath = symbolId.includes('TexturePackLoader#')
      ? 'DynmapCore/src/main/java/org/dynmap/hdmap/TexturePackLoader.java'
      : 'DynmapCore/src/main/java/org/dynmap/hdmap/TexturePack.java';
    if (!declaration || declaration.sourcePath !== expectedPath) {
      fail(`Pinned AST is missing a colormap consumer: ${symbolId}`);
    }
  }

  const inventoryByPath = new Map(inventory.entries.map((entry) => [entry.sourcePath, entry]));
  const catalogByPath = new Map(catalog.entries.map((entry) => [entry.sourcePath, entry]));
  if (inventoryByPath.size !== inventory.entries.length || catalogByPath.size !== catalog.entries.length
      || inventoryByPath.size !== catalogByPath.size
      || [...inventoryByPath.keys()].some((sourcePath) => !catalogByPath.has(sourcePath))) {
    fail('Resource catalog path set differs from the pinned inventory');
  }

  const paths = [...EXPECTED.values()].map(({ initializer }) => {
    const path = JSON.parse(initializer);
    return `DynmapCore/src/main/resources/texturepacks/standard/${path}`;
  });
  for (const path of paths) if (!inventoryByPath.has(path)) fail(`Pinned colormap field references a missing resource: ${path}`);

  const entries = catalog.entries.map((entry) => {
    const source = inventoryByPath.get(entry.sourcePath);
    if (entry.sourceRevision !== PINNED_REVISION
        || entry.gitBlobSha1 !== source.gitBlobSha1
        || entry.contentSha256 !== source.contentSha256
        || entry.byteLength !== source.byteLength) {
      fail(`Resource catalog identity differs from pinned bytes: ${entry.sourcePath}`);
    }
    if (!paths.includes(entry.sourcePath)) return entry;
    if (entry.scope !== 'unclassified'
        && !(entry.scope === 'renderer-runtime' && entry.scopeStatus === SCOPE_STATUS)) {
      fail(`Refusing to overwrite an independently reviewed resource disposition: ${entry.sourcePath}`);
    }
    const id = pathDigest(entry.sourcePath);
    return {
      ...entry,
      scope: 'renderer-runtime',
      scopeStatus: SCOPE_STATUS,
      consumerSymbolIds: CONSUMERS,
      ownerPhaseId: 'P-016',
      phaseDocument: 'phases/phase-016-biome-color-material.md',
      fixturePlanIds: [`FIX-LEGACY-BIOME-COLORMAP-${id}`],
      referencePlanIds: [`REF-LEGACY-BIOME-COLORMAP-${id}`],
      focusedTestPlanIds: [`TEST-LEGACY-BIOME-COLORMAP-${id}`],
      evidencePlanIds: ['SRC-DYNMAP-LEGACY-BIOME-COLORMAP', `PLAN-LEGACY-BIOME-COLORMAP-${id}`],
      exclusionRationale: null,
      exclusionEvidenceIds: [],
      status: SCOPE_STATUS,
      implementationStatus: 'not_started',
    };
  });

  const unclassified = entries.filter((entry) => entry.scope === 'unclassified').length;
  const licenseUnverified = entries.filter((entry) => entry.licenseStatus !== 'verified').length;
  return {
    ...catalog,
    status: 'candidate_dispositions_open',
    classificationComplete: false,
    consumerClosureComplete: false,
    counts: {
      ...catalog.counts,
      total: entries.length,
      unclassified,
      licenseUnverified,
      plannedLegacyBiomeColormapRuntime: paths.length,
    },
    entries,
  };
}
