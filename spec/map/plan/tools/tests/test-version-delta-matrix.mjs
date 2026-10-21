import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createVersionDeltaMatrix,
  validateVersionDeltaMatrix,
  validateVersionDeltaReadiness,
  validateVersionDeltaReport,
  validateReleaseDeltaParityCoverage,
  validateDynmapSourceDeltaManifest,
} from '../version-delta-matrix.mjs';

const sampleMatrix = () => ({
  schemaVersion: 2,
  snapshotDate: '2026-09-23',
  range: { minimum: '1.14', maximum: '1.14.2' },
  officialManifestSnapshot: { releaseSetSha256: 'a'.repeat(64) },
  paperVersionListingSnapshot: { listedExactMinecraftVersions: ['1.14.2'] },
  entries: ['1.14', '1.14.1', '1.14.2'].map((minecraftVersion, index) => ({
    minecraftVersion,
    releaseTime: `2026-09-2${index}T00:00:00+00:00`,
    officialVersionManifestEntry: `https://piston-meta.mojang.com/${minecraftVersion}.json`,
    clientJar: { url: `https://piston-data.mojang.com/client/${minecraftVersion}.jar`, sha1: `${index}`.repeat(40), byteLength: 100 + index },
    serverJar: { url: `https://piston-data.mojang.com/server/${minecraftVersion}.jar`, sha1: `${index + 1}`.repeat(40), byteLength: 200 + index },
    assetIndex: { url: `https://piston-meta.mojang.com/assets/${minecraftVersion}.json`, sha1: `${index + 2}`.repeat(40), byteLength: 300 + index },
  })),
});

test('creates one exact delta record per release and keeps Paper separate', () => {
  const matrix = sampleMatrix();
  const delta = createVersionDeltaMatrix(matrix);
  assert.equal(delta.schemaVersion, 4);
  assert.deepEqual(delta.entries.map((entry) => entry.minecraftVersion), ['1.14', '1.14.1', '1.14.2']);
  assert.deepEqual(delta.entries.map((entry) => entry.previousStableRelease), [null, '1.14', '1.14.1']);
  assert.equal(delta.entries[0].rendererAssets.status, 'pending');
  assert.equal(delta.entries[0].dynmapOracle.status, 'pending');
  assert.equal(delta.entries[0].rendererAssets.profileId, undefined);
  assert.match(delta.comparisonPolicy.sharedProfileRule, /different_inputs_may_share/);
  assert.equal(delta.comparisonPolicy.noDiffRequiresArtifactDigestsAndEqualRendererInputFingerprint, true);
  assert.equal(delta.dynmapOraclePolicy.neverInferTargetVersionSupportFromBaselinePinAlone, true);
  assert.equal(delta.entries[0].paperLive.catalogState, 'exact_version_not_listed_at_snapshot');
  assert.equal(delta.entries[2].paperLive.catalogState, 'listed_build_not_yet_verified');
  assert.deepEqual(validateVersionDeltaMatrix(delta, matrix), []);
});

test('rejects page-count-only coverage, altered official artifact locks, and incorrect release baselines', () => {
  const matrix = sampleMatrix();
  const delta = createVersionDeltaMatrix(matrix);
  delta.entries[1].artifacts.clientJar.officialSha1 = 'f'.repeat(40);
  delta.entries[1].previousStableRelease = '1.14.2';
  delta.entries.pop();
  const errors = validateVersionDeltaMatrix(delta, matrix);
  assert.ok(errors.some((error) => error.includes('does not have exactly one entry')));
  assert.ok(errors.some((error) => error.includes('clientJar lock does not match')));
  assert.ok(errors.some((error) => error.includes('wrong previous stable release')));
});

test('strict readiness rejects metadata rows without downloaded artifacts and verified per-axis deltas', () => {
  const matrix = sampleMatrix();
  const errors = validateVersionDeltaReadiness(createVersionDeltaMatrix(matrix), matrix);
  assert.ok(errors.some((error) => error.includes('clientJar artifact has no verified downloaded SHA-256')));
  assert.ok(errors.some((error) => error.includes('rendererAssets delta report is not verified')));
  assert.ok(errors.some((error) => error.includes('savedAnvil delta report is not verified')));
  assert.ok(errors.some((error) => error.includes('dynmapOracle delta report is not verified')));
  assert.ok(errors.some((error) => error.includes('Paper live compatibility is not verified')));
  assert.ok(errors.some((error) => error.includes('referenceParity delta report is not verified')));
});

test('strict readiness accepts each exact release only after all data axes are individually verified', () => {
  const matrix = sampleMatrix();
  const delta = createVersionDeltaMatrix(matrix);
  for (const entry of delta.entries) {
    for (const artifact of Object.values(entry.artifacts)) artifact.downloadedSha256 = 'a'.repeat(64);
    for (const field of ['rendererAssets', 'savedAnvil', 'dynmapOracle', 'referenceParity']) {
      entry[field] = {
        status: 'verified',
        path: entry[field].path,
        sha256: 'b'.repeat(64),
        inputFingerprints: { target: 'c'.repeat(64), baseline: entry.previousStableRelease ? 'd'.repeat(64) : null },
      };
      if (entry.previousStableRelease) entry[field].inputFingerprints.baseline = 'd'.repeat(64);
    }
    entry.dynmapOracle.sourceSelection = {
      repository: 'https://github.com/webbukkit/dynmap',
      baselineRevision: '93b454efb8802dc7406d6873434f2aeec5c636f4',
      baselineSourceTreeSha256: '1'.repeat(64),
      selectedRevision: '2'.repeat(40),
      selectedSourceTreeSha256: '3'.repeat(64),
      referenceBuildSha256: '4'.repeat(64),
      sourceDeltaManifestSha256: '5'.repeat(64),
    };
    if (entry.paperLive.catalogState === 'listed_build_not_yet_verified') {
      entry.paperLive.status = 'verified';
      entry.paperLive.paperBuildNumber = 1;
      entry.paperLive.paperJarSha256 = 'e'.repeat(64);
      entry.paperLive.javaRuntimeMajor = 21;
      entry.paperLive.mappingProfile = 'paper-mojang-mappings';
      entry.paperLive.snapshotSchemaFingerprint = 'f'.repeat(64);
    } else {
      entry.paperLive.status = 'unavailable_verified';
      entry.paperLive.officialAvailabilityEvidenceSha256 = 'f'.repeat(64);
    }
    entry.paperLive.report = {
      status: 'verified',
      path: entry.paperLive.report.path,
      sha256: 'b'.repeat(64),
      inputFingerprints: { target: 'c'.repeat(64), baseline: entry.previousStableRelease ? 'd'.repeat(64) : null },
    };
    if (entry.previousStableRelease) entry.paperLive.report.inputFingerprints.baseline = 'd'.repeat(64);
  }

  assert.deepEqual(validateVersionDeltaReadiness(delta, matrix), []);
});

function assetReport({ comparisonResult = 'no_renderer_visible_delta', targetFingerprint = 'a'.repeat(64), baselineFingerprint = 'a'.repeat(64), addedBlockIds = [] } = {}) {
  const report = {
    schemaVersion: 2,
    kind: 'assets',
    minecraftVersion: '1.14.1',
    baselineVersion: '1.14',
    extractor: { revision: 'extractor-commit', sha256: 'b'.repeat(64) },
    fingerprints: { target: targetFingerprint, baseline: baselineFingerprint },
    artifactInputs: { targetSha256: 'c'.repeat(64), baselineSha256: 'd'.repeat(64), targetAssetIndexSha256: 'e'.repeat(64), baselineAssetIndexSha256: 'f'.repeat(64) },
    fixtureIds: ['asset-profile-1.14.1'],
    comparisonResult,
    inventories: Object.fromEntries(['clientJarEntries', 'blockRegistry', 'blockStates', 'assetIndexObjects', 'canonicalResourceMap', 'resolvedModelGraph', 'rendererAssetClosure'].map((key) => [key, { path: `inventory/${key}.json`, sha256: '1'.repeat(64), itemCount: 1 }])),
    coverage: { unmappedRegistryBlockCount: 0, unresolvedBlockStateCount: 0, missingModelCount: 0, missingTextureCount: 0, unresolvedRendererResourcePathCount: 0, ambiguousRendererAssetSourceCount: 0, duplicateLogicalPathConflictCount: 0, unverifiedClientJarEntryCount: 0, unverifiedRendererAssetObjectCount: 0 },
    changes: {
      addedBlockIds,
      removedBlockIds: [],
      changedBlockIds: [],
      changedBlockStateProperties: [],
      changedBlockstateSelectors: [],
      changedModelResolution: [],
      changedTextures: [],
      changedBiomeTints: [],
      changedMaterials: [],
      changedLightingAndEmission: [],
      addedRendererResourcePaths: [],
      removedRendererResourcePaths: [],
      changedRendererResourcePaths: [],
      changedAssetSourceLocations: [],
    },
  };
  Object.assign(report.inventories.assetIndexObjects, {
    targetAssetIndexSha256: 'e'.repeat(64),
    baselineAssetIndexSha256: 'f'.repeat(64),
  });
  Object.assign(report.inventories.clientJarEntries, {
    targetClientJarSha256: 'c'.repeat(64),
    baselineClientJarSha256: 'd'.repeat(64),
  });
  Object.assign(report.inventories.canonicalResourceMap, {
    sourceRoots: ['client_jar_entries', 'asset_index_objects'],
    targetClientJarSha256: 'c'.repeat(64),
    baselineClientJarSha256: 'd'.repeat(64),
    targetAssetIndexSha256: 'e'.repeat(64),
    baselineAssetIndexSha256: 'f'.repeat(64),
    sourceResolutionPolicySha256: '2'.repeat(64),
  });
  return report;
}

test('requires changed block states to reach resolved models, texture digests, fixtures and Dynmap traces', () => {
  const report = assetReport({
    comparisonResult: 'delta',
    targetFingerprint: '2'.repeat(64),
    baselineFingerprint: '3'.repeat(64),
    addedBlockIds: [{ changeId: 'asset:new-block:example', renderImpact: 'renderer_input', blockId: 'minecraft:example_block' }],
  });
  const errors = validateVersionDeltaReport(report, {
    kind: 'assets', version: '1.14.1', baselineVersion: '1.14', targetDigest: 'c'.repeat(64), baselineDigest: 'd'.repeat(64),
    additionalArtifactInputs: { targetAssetIndexSha256: 'e'.repeat(64), baselineAssetIndexSha256: 'f'.repeat(64) },
  });
  assert.ok(errors.some((error) => error.includes('not linked to resolved models')));
  assert.ok(errors.some((error) => error.includes('not linked to exact texture digests')));
  assert.ok(errors.some((error) => error.includes('has no fixture')));
  assert.ok(errors.some((error) => error.includes('has no Dynmap reference trace')));
});

test('rejects a claimed no-diff profile when the asset fingerprints differ', () => {
  const errors = validateVersionDeltaReport(assetReport({ targetFingerprint: '2'.repeat(64) }), {
    kind: 'assets', version: '1.14.1', baselineVersion: '1.14', targetDigest: 'c'.repeat(64), baselineDigest: 'd'.repeat(64),
    additionalArtifactInputs: { targetAssetIndexSha256: 'e'.repeat(64), baselineAssetIndexSha256: 'f'.repeat(64) },
  });
  assert.ok(errors.includes('no-diff result has unequal renderer/schema fingerprints'));
});

test('rejects a generic profile ID on a version-data report', () => {
  const report = assetReport();
  report.profileId = 'misleading-shared-profile';
  const errors = validateVersionDeltaReport(report, {
    kind: 'assets', version: '1.14.1', baselineVersion: '1.14', targetDigest: 'c'.repeat(64), baselineDigest: 'd'.repeat(64),
    additionalArtifactInputs: { targetAssetIndexSha256: 'e'.repeat(64), baselineAssetIndexSha256: 'f'.repeat(64) },
  });
  assert.ok(errors.some((error) => error.includes('axis-specific fingerprints or parity implementationProfile')));
});

function rendererChange(changeId, fixtureIds = ['fixture-new-block'], referenceTraceIds = ['trace-new-block']) {
  return { changeId, renderImpact: 'renderer_input', fixtureIds, referenceTraceIds };
}

function parityEvidence({ decision = 'shared_existing_profile', id = 'renderer-generic-v1', previousProfileId = 'renderer-generic-v1', changeCoverage = [] } = {}) {
  return {
    schemaVersion: 2,
    kind: 'parity',
    minecraftVersion: '1.14.1',
    referenceTraceIds: ['trace-new-block'],
    pixelComparisons: [{
      comparisonId: 'pixel-new-block',
      referenceTraceId: 'trace-new-block',
      fixtureId: 'fixture-new-block',
      referencePngSha256: '1'.repeat(64),
      rustPngSha256: '1'.repeat(64),
      differingPixelCount: 0,
    }],
    implementationProfile: {
      decision,
      id,
      comparedAgainstRelease: '1.14',
      previousProfileId,
      adapterOwnerPhaseId: decision === 'new_adapter' ? 'P-ADAPTER-NEW-BLOCK' : null,
      behaviorGapEvidence: decision === 'new_adapter' ? {
        changeId: 'asset:new-block:example',
        description: 'The prior generic resolver selected the wrong multipart model for this exact state.',
        fixtureId: 'fixture-new-block',
        referenceTraceId: 'trace-new-block',
        rustFailureEvidenceId: 'failure-before-adapter',
        adapterCommitSha: 'a'.repeat(40),
      } : null,
    },
    changeCoverage,
  };
}

test('different renderer inputs may share one implementation profile after exact per-change pixel parity', () => {
  const changedAssetReport = {
    kind: 'assets',
    changes: { addedBlockIds: [rendererChange('asset:new-block:example')], ...Object.fromEntries(assetChangeFieldsForTest().map((field) => [field, field === 'addedBlockIds' ? undefined : []])) },
  };
  delete changedAssetReport.changes.addedBlockIds;
  changedAssetReport.changes.addedBlockIds = [rendererChange('asset:new-block:example')];
  const noAnvilDelta = { kind: 'anvil', changes: Object.fromEntries(anvilChangeFieldsForTest().map((field) => [field, []])) };
  const parity = parityEvidence({ changeCoverage: [{
    changeId: 'asset:new-block:example',
    fixtureIds: ['fixture-new-block'],
    referenceTraceIds: ['trace-new-block'],
    pixelComparisonIds: ['pixel-new-block'],
  }] });
  const previous = { implementationProfile: { id: 'renderer-generic-v1' } };

  assert.deepEqual(validateReleaseDeltaParityCoverage({
    version: '1.14.1', baselineVersion: '1.14', assetsReport: changedAssetReport,
    anvilReport: noAnvilDelta, parityReport: parity, previousParityReport: previous,
  }), []);
});

test('rejects a shared implementation profile when a renderer-input delta lacks exact pixel coverage', () => {
  const changedAssetReport = {
    kind: 'assets',
    fingerprints: { target: '2'.repeat(64), baseline: '3'.repeat(64) },
    changes: Object.fromEntries(assetChangeFieldsForTest().map((field) => [field, field === 'addedBlockIds' ? [rendererChange('asset:new-block:example')] : []])),
  };
  const noAnvilDelta = { kind: 'anvil', fingerprints: { target: '4'.repeat(64), baseline: '4'.repeat(64) }, changes: Object.fromEntries(anvilChangeFieldsForTest().map((field) => [field, []])) };
  const errors = validateReleaseDeltaParityCoverage({
    version: '1.14.1', baselineVersion: '1.14', assetsReport: changedAssetReport,
    anvilReport: noAnvilDelta,
    parityReport: parityEvidence({ changeCoverage: [] }),
    previousParityReport: { implementationProfile: { id: 'renderer-generic-v1' } },
  });
  assert.ok(errors.some((error) => error.includes('every renderer-input change must have exactly one parity coverage row')));
});

test('rejects a pixel comparison whose fixture is unrelated to the changed input', () => {
  const changedAssetReport = {
    kind: 'assets',
    changes: Object.fromEntries(assetChangeFieldsForTest().map((field) => [field, field === 'addedBlockIds' ? [rendererChange('asset:new-block:example')] : []])),
  };
  const noAnvilDelta = { kind: 'anvil', changes: Object.fromEntries(anvilChangeFieldsForTest().map((field) => [field, []])) };
  const parity = parityEvidence({ changeCoverage: [{
    changeId: 'asset:new-block:example',
    fixtureIds: ['fixture-new-block'],
    referenceTraceIds: ['trace-new-block'],
    pixelComparisonIds: ['pixel-new-block'],
  }] });
  parity.pixelComparisons[0].fixtureId = 'unrelated-fixture';
  const errors = validateReleaseDeltaParityCoverage({
    version: '1.14.1', baselineVersion: '1.14', assetsReport: changedAssetReport,
    anvilReport: noAnvilDelta, parityReport: parity,
    previousParityReport: { implementationProfile: { id: 'renderer-generic-v1' } },
  });
  assert.ok(errors.some((error) => error.includes('uses a fixture outside change')));
});

test('rejects a new implementation profile without a concrete previously failing behavior gap', () => {
  const parity = parityEvidence({ decision: 'new_adapter', id: 'renderer-v2', previousProfileId: 'renderer-generic-v1' });
  parity.implementationProfile.behaviorGapEvidence.rustFailureEvidenceId = '';
  const errors = validateVersionDeltaReport(parity, {
    kind: 'parity', version: '1.14.1', baselineVersion: '1.14',
    targetDigest: 'c'.repeat(64), baselineDigest: 'd'.repeat(64),
  });
  assert.ok(errors.some((error) => error.includes('no pre-adapter Rust failure evidence')));
});

function assetChangeFieldsForTest() {
  return [
    'addedBlockIds', 'removedBlockIds', 'changedBlockIds', 'changedBlockStateProperties',
    'changedBlockstateSelectors', 'changedModelResolution', 'changedTextures',
    'changedBiomeTints', 'changedMaterials', 'changedLightingAndEmission',
    'addedRendererResourcePaths', 'removedRendererResourcePaths', 'changedRendererResourcePaths',
    'changedAssetSourceLocations',
  ];
}

function anvilChangeFieldsForTest() {
  return ['dataVersion', 'dimensionHeight', 'regionCompression', 'chunkNbtFields', 'sectionLayout', 'blockPaletteEncoding', 'biomePaletteEncoding', 'heightmaps', 'skyLight', 'blockLight', 'blockEntities'];
}

test('requires a verified renderer-consumed object closure bound to both exact asset indexes', () => {
  const missingInventory = assetReport();
  delete missingInventory.inventories.assetIndexObjects;
  const missingErrors = validateVersionDeltaReport(missingInventory, {
    kind: 'assets', version: '1.14.1', baselineVersion: '1.14', targetDigest: 'c'.repeat(64), baselineDigest: 'd'.repeat(64),
    additionalArtifactInputs: { targetAssetIndexSha256: 'e'.repeat(64), baselineAssetIndexSha256: 'f'.repeat(64) },
  });
  assert.ok(missingErrors.some((error) => error.includes('complete assetIndexObjects inventory path is missing')));
  assert.ok(missingErrors.some((error) => error.includes('not bound to the exact target asset index')));

  const unverifiedObject = assetReport();
  unverifiedObject.coverage.unverifiedRendererAssetObjectCount = 1;
  const objectErrors = validateVersionDeltaReport(unverifiedObject, {
    kind: 'assets', version: '1.14.1', baselineVersion: '1.14', targetDigest: 'c'.repeat(64), baselineDigest: 'd'.repeat(64),
    additionalArtifactInputs: { targetAssetIndexSha256: 'e'.repeat(64), baselineAssetIndexSha256: 'f'.repeat(64) },
  });
  assert.ok(objectErrors.includes('renderer-consumed asset objects are missing verified bytes/digests'));
});

test('rejects asset-index-only renderer inventories without exact client JAR resource coverage', () => {
  const report = assetReport();
  delete report.inventories.clientJarEntries;
  const errors = validateVersionDeltaReport(report, {
    kind: 'assets', version: '1.14.1', baselineVersion: '1.14', targetDigest: 'c'.repeat(64), baselineDigest: 'd'.repeat(64),
    additionalArtifactInputs: { targetAssetIndexSha256: 'e'.repeat(64), baselineAssetIndexSha256: 'f'.repeat(64) },
  });
  assert.ok(errors.some((error) => error.includes('complete clientJarEntries inventory path is missing')));
  assert.ok(errors.some((error) => error.includes('not bound to the exact target client JAR')));

  const wrongJarBinding = assetReport();
  wrongJarBinding.inventories.clientJarEntries.targetClientJarSha256 = '9'.repeat(64);
  const bindingErrors = validateVersionDeltaReport(wrongJarBinding, {
    kind: 'assets', version: '1.14.1', baselineVersion: '1.14', targetDigest: 'c'.repeat(64), baselineDigest: 'd'.repeat(64),
    additionalArtifactInputs: { targetAssetIndexSha256: 'e'.repeat(64), baselineAssetIndexSha256: 'f'.repeat(64) },
  });
  assert.ok(bindingErrors.some((error) => error.includes('not bound to the exact target client JAR')));
});

test('requires a canonical resource map that binds both official source roots and rejects source conflicts', () => {
  const missingJarRoot = assetReport();
  missingJarRoot.inventories.canonicalResourceMap.sourceRoots = ['asset_index_objects'];
  const missingJarErrors = validateVersionDeltaReport(missingJarRoot, {
    kind: 'assets', version: '1.14.1', baselineVersion: '1.14', targetDigest: 'c'.repeat(64), baselineDigest: 'd'.repeat(64),
    additionalArtifactInputs: { targetAssetIndexSha256: 'e'.repeat(64), baselineAssetIndexSha256: 'f'.repeat(64) },
  });
  assert.ok(missingJarErrors.some((error) => error.includes('both client JAR entries and asset-index objects')));

  const missingAssetIndexRoot = assetReport();
  missingAssetIndexRoot.inventories.canonicalResourceMap.sourceRoots = ['client_jar_entries'];
  const missingIndexErrors = validateVersionDeltaReport(missingAssetIndexRoot, {
    kind: 'assets', version: '1.14.1', baselineVersion: '1.14', targetDigest: 'c'.repeat(64), baselineDigest: 'd'.repeat(64),
    additionalArtifactInputs: { targetAssetIndexSha256: 'e'.repeat(64), baselineAssetIndexSha256: 'f'.repeat(64) },
  });
  assert.ok(missingIndexErrors.some((error) => error.includes('both client JAR entries and asset-index objects')));

  const conflict = assetReport();
  conflict.coverage.duplicateLogicalPathConflictCount = 1;
  const conflictErrors = validateVersionDeltaReport(conflict, {
    kind: 'assets', version: '1.14.1', baselineVersion: '1.14', targetDigest: 'c'.repeat(64), baselineDigest: 'd'.repeat(64),
    additionalArtifactInputs: { targetAssetIndexSha256: 'e'.repeat(64), baselineAssetIndexSha256: 'f'.repeat(64) },
  });
  assert.ok(conflictErrors.includes('client JAR and asset index contain conflicting bytes for a logical resource path'));

  const wrongSchema = assetReport();
  wrongSchema.schemaVersion = 1;
  const schemaErrors = validateVersionDeltaReport(wrongSchema, {
    kind: 'assets', version: '1.14.1', baselineVersion: '1.14', targetDigest: 'c'.repeat(64), baselineDigest: 'd'.repeat(64),
    additionalArtifactInputs: { targetAssetIndexSha256: 'e'.repeat(64), baselineAssetIndexSha256: 'f'.repeat(64) },
  });
  assert.ok(schemaErrors.includes('assets report schemaVersion must be 2'));
});

test('requires source-bound asset inventory digests for the absolute first-release baseline', () => {
  const report = assetReport({ comparisonResult: 'baseline_snapshot' });
  report.minecraftVersion = '1.14';
  report.baselineVersion = null;
  report.fingerprints.baseline = null;
  delete report.artifactInputs.baselineSha256;
  delete report.artifactInputs.baselineAssetIndexSha256;
  report.inventories.clientJarEntries.baselineClientJarSha256 = null;
  report.inventories.assetIndexObjects.baselineAssetIndexSha256 = null;
  report.inventories.canonicalResourceMap.baselineClientJarSha256 = null;
  report.inventories.canonicalResourceMap.baselineAssetIndexSha256 = null;

  const errors = validateVersionDeltaReport(report, {
    kind: 'assets', version: '1.14', baselineVersion: null, targetDigest: 'c'.repeat(64),
    additionalArtifactInputs: { targetAssetIndexSha256: 'e'.repeat(64) },
  });
  assert.deepEqual(errors, []);

  report.inventories.canonicalResourceMap.targetAssetIndexSha256 = '9'.repeat(64);
  const wrongBindingErrors = validateVersionDeltaReport(report, {
    kind: 'assets', version: '1.14', baselineVersion: null, targetDigest: 'c'.repeat(64),
    additionalArtifactInputs: { targetAssetIndexSha256: 'e'.repeat(64) },
  });
  assert.ok(wrongBindingErrors.some((error) => error.includes('canonical resource map is not bound to the exact target asset index')));
});

test('requires exact-release Dynmap oracle evidence and rejects treating the old base pin as universal support', () => {
  const baseReport = {
    schemaVersion: 1,
    kind: 'dynmap-oracle',
    minecraftVersion: '1.14.1',
    baselineVersion: '1.14',
    extractor: { revision: 'source-audit-commit', sha256: 'b'.repeat(64) },
    fingerprints: { target: 'a'.repeat(64), baseline: 'a'.repeat(64) },
    artifactInputs: {
      targetSha256: 'c'.repeat(64),
      baselineSha256: 'd'.repeat(64),
      targetDynmapSourceTreeSha256: 'e'.repeat(64),
      baselineDynmapSourceTreeSha256: 'f'.repeat(64),
    },
    fixtureIds: ['dynmap-oracle-1.14.1'],
    sourceSelection: {
      repository: 'https://github.com/webbukkit/dynmap',
      baselineRevision: '93b454efb8802dc7406d6873434f2aeec5c636f4',
      baselineSourceTreeSha256: 'f'.repeat(64),
      selectedRevision: '1'.repeat(40),
      selectedSourceTreeSha256: 'e'.repeat(64),
      referenceBuildSha256: '1'.repeat(64),
      sourceDeltaManifestSha256: '3'.repeat(64),
      exactVersionSupportEvidence: [{
        minecraftVersion: '1.14.1',
        sourcePath: 'bukkit-helper-114-1/src/main/java/Example.java',
        behavior: 'maps the exact release registry state to a renderer model',
        sourceFileSha256: '2'.repeat(64),
      }],
    },
    sourceDeltaFromBaseline: {
      path: 'spec/map/evidence/version-deltas/1.14.1/dynmap-source-delta.json',
      sha256: '3'.repeat(64),
      rendererRelevantAddedSymbolCount: 1,
      rendererRelevantRemovedSymbolCount: 0,
      rendererRelevantChangedSymbolCount: 0,
      rendererRelevantAddedResourceCount: 0,
      rendererRelevantRemovedResourceCount: 0,
      rendererRelevantChangedResourceCount: 0,
      unclassifiedRendererRelevantChangeCount: 0,
    },
    targetVersionCoverage: {
      newBlockIdsWithoutRendererMapping: 0,
      changedBlockStatesWithoutRendererMapping: 0,
      unresolvedRendererAssetReferences: 0,
      unsupportedBuiltInRendererCases: 0,
      unaccountedRendererVisibleChanges: 0,
    },
  };
  const options = {
    kind: 'dynmap-oracle',
    version: '1.14.1',
    baselineVersion: '1.14',
    targetDigest: 'c'.repeat(64),
    baselineDigest: 'd'.repeat(64),
    additionalArtifactInputs: {
      targetDynmapSourceTreeSha256: 'e'.repeat(64),
      baselineDynmapSourceTreeSha256: 'f'.repeat(64),
    },
  };
  assert.deepEqual(validateVersionDeltaReport(baseReport, options), []);

  const mismatchedSourceSelection = structuredClone(baseReport);
  mismatchedSourceSelection.sourceSelection.selectedRevision = '9'.repeat(40);
  assert.ok(validateVersionDeltaReport(mismatchedSourceSelection, {
    ...options,
    expectedDynmapSourceSelection: baseReport.sourceSelection,
  }).some((error) => error.includes('does not match the exact-release matrix')));

  const universalPinClaim = structuredClone(baseReport);
  universalPinClaim.sourceSelection.selectedRevision = '93b454efb8802dc7406d6873434f2aeec5c636f4';
  delete universalPinClaim.sourceSelection.exactVersionSupportEvidence;
  delete universalPinClaim.sourceDeltaFromBaseline;
  delete universalPinClaim.targetVersionCoverage;
  const errors = validateVersionDeltaReport(universalPinClaim, options);
  assert.ok(errors.includes('exact-version Dynmap support evidence is missing'));
  assert.ok(errors.includes('Dynmap source delta manifest path is not canonical for this exact release'));
  assert.ok(errors.includes('new block IDs lack renderer mappings for this release'));
});

test('validates byte-digest-bound Dynmap source delta against exact release selection and complete change rows', () => {
  const report = {
    sourceDeltaFromBaseline: {
      rendererRelevantAddedSymbolCount: 1,
      rendererRelevantRemovedSymbolCount: 0,
      rendererRelevantChangedSymbolCount: 0,
      rendererRelevantAddedResourceCount: 0,
      rendererRelevantRemovedResourceCount: 0,
      rendererRelevantChangedResourceCount: 0,
      unclassifiedRendererRelevantChangeCount: 0,
    },
    targetVersionCoverage: {
      newBlockIdsWithoutRendererMapping: 0,
      changedBlockStatesWithoutRendererMapping: 0,
      unresolvedRendererAssetReferences: 0,
      unsupportedBuiltInRendererCases: 0,
      unaccountedRendererVisibleChanges: 0,
    },
  };
  const sourceSelection = {
    baselineRevision: '93b454efb8802dc7406d6873434f2aeec5c636f4',
    baselineSourceTreeSha256: 'a'.repeat(64),
    selectedRevision: '1'.repeat(40),
    selectedSourceTreeSha256: 'b'.repeat(64),
  };
  const manifest = {
    schemaVersion: 1,
    minecraftVersion: '1.14.1',
    baselineSource: { revision: sourceSelection.baselineRevision, treeSha256: sourceSelection.baselineSourceTreeSha256 },
    selectedSource: { revision: sourceSelection.selectedRevision, treeSha256: sourceSelection.selectedSourceTreeSha256 },
    inventory: {
      baselineJavaAstSha256: 'c'.repeat(64),
      selectedJavaAstSha256: 'd'.repeat(64),
      baselineResourceInventorySha256: 'e'.repeat(64),
      selectedResourceInventorySha256: 'f'.repeat(64),
      comparedJavaFileCount: 106,
      comparedJavaDeclarationCount: 1489,
      comparedResourceCount: 3485,
    },
    changes: {
      addedRendererSymbols: [{
        symbolId: 'Example#render',
        sourcePath: 'bukkit-helper-114-1/src/main/java/Example.java',
        rustDestination: 'versions/v1_14_1.rs',
        beforeSha256: null,
        afterSha256: '1'.repeat(64),
        fixtureIds: ['fixture-new-state'],
        referenceTraceIds: ['trace-new-state'],
      }],
      removedRendererSymbols: [],
      changedRendererSymbols: [],
      addedRendererResources: [],
      removedRendererResources: [],
      changedRendererResources: [],
    },
    coverage: {
      unclassifiedRendererRelevantChangeCount: 0,
      newBlockIdsWithoutRendererMapping: 0,
      changedBlockStatesWithoutRendererMapping: 0,
      unresolvedRendererAssetReferences: 0,
      unsupportedBuiltInRendererCases: 0,
      unaccountedRendererVisibleChanges: 0,
    },
  };

  assert.deepEqual(validateDynmapSourceDeltaManifest(manifest, { version: '1.14.1', sourceSelection, report }), []);
  const missingFixture = structuredClone(manifest);
  missingFixture.changes.addedRendererSymbols[0].fixtureIds = [];
  assert.ok(validateDynmapSourceDeltaManifest(missingFixture, { version: '1.14.1', sourceSelection, report }).some((error) => error.includes('no fixture IDs')));
  const falseNoDiff = structuredClone(manifest);
  falseNoDiff.changes.addedRendererSymbols = [];
  assert.ok(validateDynmapSourceDeltaManifest(falseNoDiff, { version: '1.14.1', sourceSelection, report }).some((error) => error.includes('count does not match')));
});
