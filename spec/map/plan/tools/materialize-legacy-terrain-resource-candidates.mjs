import { createHash } from 'node:crypto';

const PINNED_REVISION = '93b454efb8802dc7406d6873434f2aeec5c636f4';
const TERRAIN_PREFIX = 'DynmapCore/src/main/resources/texturepacks/standard/';
const TERRAIN_ARRAY_ID = 'field:type:org.dynmap.hdmap.TexturePack#terrain_rp_map';
const CONSUMERS = [
  TERRAIN_ARRAY_ID,
  'method:type:org.dynmap.hdmap.TexturePack#getRPFileName(int)',
  'method:type:org.dynmap.hdmap.TexturePack#resetFiles()',
  'constructor:type:org.dynmap.hdmap.TexturePack#%3cinit%3e(DynmapCore,String)',
  'method:type:org.dynmap.hdmap.TexturePack#loadTerrain(boolean)',
  'method:type:org.dynmap.hdmap.TexturePack#loadImage(InputStream,int,String,String)',
  'method:type:org.dynmap.hdmap.TexturePack#findOrAddDynamicTileFile(String,String,int,int,TileFileFormat,String%5b%5d)',
  'method:type:org.dynmap.hdmap.TexturePackLoader#openTPResource(String)',
  'method:type:org.dynmap.hdmap.TexturePackLoader#openModTPResource(String,String)',
];
const SCOPE_STATUS = 'planned_renderer_runtime_pending_license_and_global_closure';
const SOURCE_EVIDENCE = 'SRC-DYNMAP-LEGACY-RP-TERRAIN-MAPPING';

const fail = (message) => { throw new Error(message); };
const pathDigest = (sourcePath) => createHash('sha256').update(sourcePath).digest('hex').slice(0, 20);

function requireUniqueRows(rows, key, label) {
  const byKey = new Map();
  for (const row of rows ?? []) {
    if (typeof row[key] !== 'string' || byKey.has(row[key])) fail(`${label} has a missing or duplicate ${key}`);
    byKey.set(row[key], row);
  }
  return byKey;
}

function parseStringArrayInitializer(initializer) {
  if (typeof initializer !== 'string') fail('Pinned terrain texture map initializer is missing');
  const source = initializer.trim();
  if (!source.startsWith('{') || !source.endsWith('}')) {
    fail('Pinned terrain texture map initializer is not a Java array initializer');
  }
  const body = source.slice(1, -1).trim();
  if (!body) return [];
  return body.split(',').map((part) => {
    const scalar = part.trim();
    if (scalar === 'null') return null;
    if (/^"[^"\\]*"$/.test(scalar)) return scalar.slice(1, -1);
    fail('Pinned terrain texture map initializer contains a non-scalar expression');
  });
}

export function materializeLegacyTerrainResourceCandidates(
  astInventory,
  inventory,
  catalog,
  { expectedSlotCount = 267, expectedUniqueResourceCount = 224 } = {},
) {
  if (astInventory?.sourceRevision !== PINNED_REVISION
      || astInventory?.sourceRevisionProvenance !== 'verified_against_git_commit_and_java_blob_ids'
      || astInventory?.sourceTreeSha1 !== inventory?.sourceTreeSha1
      || !Array.isArray(astInventory.declarations)
      || astInventory?.counts?.parseErrors !== 0
      || astInventory?.counts?.declarations !== astInventory.declarations.length) {
    fail('Pinned Java AST inventory is missing or has an unexpected revision');
  }
  if (inventory?.sourceRevision !== PINNED_REVISION || !Array.isArray(inventory.entries)) {
    fail('Pinned resource inventory is missing or has an unexpected revision');
  }
  if (catalog?.sourceRevision !== PINNED_REVISION || !Array.isArray(catalog.entries)) {
    fail('Pinned resource catalog is missing or has an unexpected revision');
  }

  const declarations = requireUniqueRows(astInventory.declarations, 'symbolId', 'Pinned AST');
  const terrainArray = declarations.get(TERRAIN_ARRAY_ID);
  if (terrainArray?.kind !== 'field'
      || terrainArray.signature !== 'org.dynmap.hdmap.TexturePack#terrain_rp_map:String[]'
      || terrainArray.sourcePath !== 'DynmapCore/src/main/java/org/dynmap/hdmap/TexturePack.java'
      || terrainArray.startLine !== 280
      || terrainArray.endLine !== 316) {
    fail('Pinned terrain texture map declaration differs from the audited source span');
  }
  for (const symbolId of CONSUMERS) {
    const consumer = declarations.get(symbolId);
    const expectedPath = symbolId.includes('TexturePackLoader#')
      ? 'DynmapCore/src/main/java/org/dynmap/hdmap/TexturePackLoader.java'
      : 'DynmapCore/src/main/java/org/dynmap/hdmap/TexturePack.java';
    if (!consumer || consumer.sourcePath !== expectedPath) {
      fail(`Pinned AST is missing a required texture consumer: ${symbolId}`);
    }
  }

  const names = parseStringArrayInitializer(terrainArray.initializer);
  if (!Array.isArray(names) || names.some((name) => name !== null && (typeof name !== 'string' || name.length === 0))) {
    fail('Pinned terrain texture map initializer has an unsupported value');
  }
  if (names.length !== expectedSlotCount) {
    fail(`Pinned terrain texture map slot count changed: expected ${expectedSlotCount}, found ${names.length}`);
  }

  const paths = [...new Set(names.filter(Boolean).map((name) => `${TERRAIN_PREFIX}assets/minecraft/textures/blocks/${name}.png`))].sort();
  if (paths.length !== expectedUniqueResourceCount) {
    fail(`Pinned legacy terrain resource count changed: expected ${expectedUniqueResourceCount}, found ${paths.length}`);
  }

  const inventoryByPath = requireUniqueRows(inventory.entries, 'sourcePath', 'Pinned resource inventory');
  const catalogByPath = requireUniqueRows(catalog.entries, 'sourcePath', 'Pinned resource catalog');
  if (inventoryByPath.size !== catalogByPath.size
      || [...inventoryByPath.keys()].some((sourcePath) => !catalogByPath.has(sourcePath))) {
    fail('Resource catalog path set differs from the pinned inventory');
  }
  for (const sourcePath of paths) {
    if (!inventoryByPath.has(sourcePath)) fail(`Pinned terrain texture map references a missing resource: ${sourcePath}`);
  }

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
      ownerPhaseId: 'P-014',
      phaseDocument: 'phases/phase-014-texture-pack-and-atlas.md',
      fixturePlanIds: [`FIX-LEGACY-RP-TERRAIN-${id}`],
      referencePlanIds: [`REF-LEGACY-RP-TERRAIN-${id}`],
      focusedTestPlanIds: [`TEST-LEGACY-RP-TERRAIN-${id}`],
      evidencePlanIds: [SOURCE_EVIDENCE, `PLAN-LEGACY-RP-TERRAIN-${id}`],
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
      plannedLegacyTerrainRuntime: paths.length,
      legacyTerrainMappingSlots: names.length,
      legacyTerrainNonNullSlots: names.filter(Boolean).length,
    },
    entries,
  };
}
