import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareDottedVersions } from './materialize-mojang-version-snapshot.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '../../../../');
const coverageDirectory = resolve(repositoryRoot, 'spec/map/coverage');
const matrixPath = resolve(coverageDirectory, 'version-matrix.json');
const deltaPath = resolve(coverageDirectory, 'version-delta-matrix.json');
const reportBase = 'spec/map/evidence/version-deltas';

const artifactLock = (artifact) => artifact ? {
  url: artifact.url,
  officialSha1: artifact.sha1,
  byteLength: artifact.byteLength,
  downloadedSha256: null,
} : null;

const pendingReport = (kind, version) => ({
  status: 'pending',
  path: `${reportBase}/${version}/${kind}.json`,
  sha256: null,
  inputFingerprints: null,
});

const pendingDynmapSourceSelection = () => ({
  repository: 'https://github.com/webbukkit/dynmap',
  baselineRevision: '93b454efb8802dc7406d6873434f2aeec5c636f4',
  baselineSourceTreeSha256: null,
  selectedRevision: null,
  selectedSourceTreeSha256: null,
  referenceBuildSha256: null,
  sourceDeltaManifestSha256: null,
});

export function createVersionDeltaMatrix(versionMatrix) {
  const entries = [...versionMatrix.entries]
    .sort((left, right) => compareDottedVersions(left.minecraftVersion, right.minecraftVersion));
  const listedPaperVersions = new Set(versionMatrix.paperVersionListingSnapshot?.listedExactMinecraftVersions ?? []);
  return {
    schemaVersion: 4,
    snapshotDate: versionMatrix.snapshotDate,
    officialManifestReleaseSetSha256: versionMatrix.officialManifestSnapshot?.releaseSetSha256 ?? null,
    dynmapOraclePolicy: {
      baselineRepository: 'https://github.com/webbukkit/dynmap',
      baselineRevision: '93b454efb8802dc7406d6873434f2aeec5c636f4',
      selectReferenceSourcePerMinecraftRelease: true,
      requireSourceDeltaFromBaselineWhenRevisionDiffers: true,
      neverInferTargetVersionSupportFromBaselinePinAlone: true,
    },
    comparisonPolicy: {
      releaseBaseline: 'immediately_previous_official_stable_release',
      firstReleaseBaseline: 'absolute_snapshot_no_previous_release',
      sharedProfileRule: 'fingerprint_equality_proves_no_data_delta_only; different_inputs_may_share_only_after_per_change_exact_reference_and_pixel_parity',
      newAdapterRule: 'require_observed_existing_profile_behavior_gap_and_dedicated_owner_phase',
      everyRendererInputDeltaRequiresFixtureTraceAndPixelComparison: true,
      rendererAxes: ['block-registry', 'block-state-properties', 'blockstate-variants-multipart', 'resolved-model-graph', 'texture-pixels-alpha-uv', 'biome-tint', 'material', 'lighting-emission'],
      savedWorldAxes: ['data-version', 'dimension-height', 'region-compression', 'chunk-nbt-fields', 'section-layout', 'block-palette-packing', 'biome-palette', 'heightmap', 'sky-light', 'block-light', 'block-entity'],
      livePaperIsSeparateAxis: true,
      noDiffRequiresArtifactDigestsAndEqualRendererInputFingerprint: true,
    },
    entries: entries.map((entry, index) => {
      const version = entry.minecraftVersion;
      const paperListed = listedPaperVersions.has(version);
      return {
        minecraftVersion: version,
        previousStableRelease: entries[index - 1]?.minecraftVersion ?? null,
        officialVersionJson: entry.officialVersionManifestEntry,
        releaseTime: entry.releaseTime,
        artifacts: {
          clientJar: artifactLock(entry.clientJar),
          serverJar: artifactLock(entry.serverJar),
          assetIndex: artifactLock(entry.assetIndex),
        },
        rendererAssets: pendingReport('assets', version),
        savedAnvil: pendingReport('anvil', version),
        dynmapOracle: {
          ...pendingReport('dynmap-oracle', version),
          sourceSelection: pendingDynmapSourceSelection(),
        },
        paperLive: {
          catalogState: paperListed ? 'listed_build_not_yet_verified' : 'exact_version_not_listed_at_snapshot',
          status: 'unverified',
          paperBuildNumber: null,
          paperJarSha256: null,
          javaRuntimeMajor: null,
          mappingProfile: null,
          snapshotSchemaFingerprint: null,
          officialAvailabilityEvidenceSha256: null,
          report: pendingReport('paper', version),
        },
        referenceParity: pendingReport('parity', version),
        referenceParityPlan: {
          phaseId: `V-${version}-reference-and-parity`,
          phaseDocument: `phases/versions/${version}/reference-and-parity.md`,
          inputAxes: [
            'renderer-consumed-block-state-model-texture-deltas',
            'saved-anvil-schema-delta',
            'exact-version-dynmap-source-delta',
          ],
          comparisonOutputs: [
            'intermediate-renderer-trace',
            'normalized-rgba-pixel-diff',
            'deterministic-png-sha256',
          ],
          implementationProfileRule: 'decide_from_exact_per_change_reference_pixel_parity',
          status: 'planned_not_evidence',
        },
      };
    }),
  };
}

const isSha256 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export function validateVersionDeltaMatrix(deltaMatrix, versionMatrix) {
  const errors = [];
  const add = (condition, message) => { if (!condition) errors.push(message); };
  const expected = [...versionMatrix.entries]
    .sort((left, right) => compareDottedVersions(left.minecraftVersion, right.minecraftVersion));
  add(deltaMatrix?.schemaVersion === 4, 'version delta matrix schemaVersion must be 4');
  add(deltaMatrix?.snapshotDate === versionMatrix.snapshotDate, 'version delta snapshotDate does not match version matrix');
  add(deltaMatrix?.officialManifestReleaseSetSha256 === versionMatrix.officialManifestSnapshot?.releaseSetSha256, 'version delta matrix is not bound to the official release-set digest');
  add(deltaMatrix?.dynmapOraclePolicy?.baselineRepository === 'https://github.com/webbukkit/dynmap', 'Dynmap oracle baseline repository is not fixed');
  add(deltaMatrix?.dynmapOraclePolicy?.baselineRevision === '93b454efb8802dc7406d6873434f2aeec5c636f4', 'Dynmap oracle baseline revision is not fixed');
  add(deltaMatrix?.dynmapOraclePolicy?.selectReferenceSourcePerMinecraftRelease === true, 'a Dynmap reference source must be selected for every Minecraft release');
  add(deltaMatrix?.dynmapOraclePolicy?.requireSourceDeltaFromBaselineWhenRevisionDiffers === true, 'version-specific Dynmap source changes must be inventoried against the baseline');
  add(deltaMatrix?.dynmapOraclePolicy?.neverInferTargetVersionSupportFromBaselinePinAlone === true, 'the pinned baseline alone cannot prove target-version support');
  add(deltaMatrix?.comparisonPolicy?.livePaperIsSeparateAxis === true, 'Paper live support must be a separate version axis');
  add(deltaMatrix?.comparisonPolicy?.noDiffRequiresArtifactDigestsAndEqualRendererInputFingerprint === true, 'no-delta claims must require exact artifact digests and equal renderer-input fingerprints');
  add(deltaMatrix?.comparisonPolicy?.sharedProfileRule === 'fingerprint_equality_proves_no_data_delta_only; different_inputs_may_share_only_after_per_change_exact_reference_and_pixel_parity', 'implementation profile sharing must be decided by exact parity, not fingerprint equality');
  add(deltaMatrix?.comparisonPolicy?.newAdapterRule === 'require_observed_existing_profile_behavior_gap_and_dedicated_owner_phase', 'new adapter requires a concrete behavior gap and owner phase');
  add(deltaMatrix?.comparisonPolicy?.everyRendererInputDeltaRequiresFixtureTraceAndPixelComparison === true, 'every renderer-input delta must be tied to exact fixture, reference trace and pixel comparison');
  add(deltaMatrix?.entries?.length === expected.length, 'version delta matrix does not have exactly one entry per official release');
  const ids = deltaMatrix?.entries?.map((entry) => entry.minecraftVersion) ?? [];
  add(new Set(ids).size === ids.length, 'version delta matrix contains duplicate exact release IDs');

  for (let index = 0; index < expected.length; index += 1) {
    const matrixEntry = expected[index];
    const delta = deltaMatrix?.entries?.[index];
    const version = matrixEntry.minecraftVersion;
    if (!delta) {
      errors.push(`missing version delta entry: ${version}`);
      continue;
    }
    add(delta.minecraftVersion === version, `version delta entries are not in exact official release order at ${version}`);
    add(delta.previousStableRelease === (expected[index - 1]?.minecraftVersion ?? null), `wrong previous stable release for ${version}`);
    add(delta.officialVersionJson === matrixEntry.officialVersionManifestEntry, `official version JSON mismatch for ${version}`);
    for (const name of ['clientJar', 'serverJar', 'assetIndex']) {
      const actual = delta.artifacts?.[name];
      const official = matrixEntry[name];
      add(Boolean(actual && official), `${name} lock is missing for ${version}`);
      if (!actual || !official) continue;
      add(actual.url === official.url && actual.officialSha1 === official.sha1 && actual.byteLength === official.byteLength, `${name} lock does not match official metadata for ${version}`);
      if (actual.downloadedSha256 !== null) add(isSha256(actual.downloadedSha256), `${name} downloaded SHA-256 is invalid for ${version}`);
    }
    for (const [field, kind] of [['rendererAssets', 'assets'], ['savedAnvil', 'anvil'], ['dynmapOracle', 'dynmap-oracle'], ['referenceParity', 'parity']]) {
      const report = delta[field];
      add(report?.status === 'pending' || report?.status === 'verified', `${field} has invalid status for ${version}`);
      add(report?.path === `${reportBase}/${version}/${kind}.json`, `${field} report path is not canonical for ${version}`);
      if (report?.status === 'pending') {
        add(report.sha256 === null && report.inputFingerprints === null && report.profileId === undefined, `${field} pending record contains unverified or axis-ambiguous evidence for ${version}`);
      }
      if (field === 'dynmapOracle') {
        const source = report?.sourceSelection;
        add(source?.repository === 'https://github.com/webbukkit/dynmap', `Dynmap source repository is not fixed for ${version}`);
        add(source?.baselineRevision === deltaMatrix.dynmapOraclePolicy.baselineRevision, `Dynmap source baseline revision mismatch for ${version}`);
        if (report?.status === 'pending') {
          for (const key of ['baselineSourceTreeSha256', 'selectedRevision', 'selectedSourceTreeSha256', 'referenceBuildSha256', 'sourceDeltaManifestSha256']) {
            add(source?.[key] === null, `pending Dynmap source selection contains unverified ${key} for ${version}`);
          }
        } else if (report?.status === 'verified') {
          add(isSha256(source?.baselineSourceTreeSha256), `Dynmap baseline source tree digest is missing for ${version}`);
          add(/^[a-f0-9]{40}$/.test(source?.selectedRevision ?? ''), `selected Dynmap source revision is missing for ${version}`);
          add(isSha256(source?.selectedSourceTreeSha256), `selected Dynmap source tree digest is missing for ${version}`);
          add(isSha256(source?.referenceBuildSha256), `Dynmap reference build digest is missing for ${version}`);
          add(isSha256(source?.sourceDeltaManifestSha256), `Dynmap source delta manifest digest is missing for ${version}`);
        }
      }
      if (report?.status === 'verified') {
        add(isSha256(report.sha256), `${field} report digest is missing or malformed for ${version}`);
        add(report.profileId === undefined, `${field} report pointer must not conflate data fingerprints with an implementation profile for ${version}`);
        add(isSha256(report.inputFingerprints?.target), `${field} target input fingerprint is missing for ${version}`);
        if (delta.previousStableRelease !== null) {
          add(isSha256(report.inputFingerprints?.baseline), `${field} baseline input fingerprint is missing for ${version}`);
        } else {
          add(report.inputFingerprints?.baseline === null, `${field} first-release report must not claim a prior-release fingerprint for ${version}`);
        }
        const artifactNames = field === 'rendererAssets' ? ['clientJar', 'assetIndex'] : field === 'savedAnvil' ? ['serverJar'] : ['clientJar', 'serverJar', 'assetIndex'];
        for (const artifactName of artifactNames) {
          add(isSha256(delta.artifacts?.[artifactName]?.downloadedSha256), `${artifactName} downloaded SHA-256 is required before ${field} can be verified for ${version}`);
        }
      }
    }
    const paperListed = (versionMatrix.paperVersionListingSnapshot?.listedExactMinecraftVersions ?? []).includes(version);
    add(delta.paperLive?.catalogState === (paperListed ? 'listed_build_not_yet_verified' : 'exact_version_not_listed_at_snapshot'), `Paper listing state mismatch for ${version}`);
    add(delta.paperLive?.status === 'unverified' || delta.paperLive?.status === 'verified' || delta.paperLive?.status === 'unavailable_verified', `Paper live status invalid for ${version}`);
    if (delta.paperLive?.status === 'verified') {
      add(paperListed, `Paper cannot be verified as available without an exact version listing: ${version}`);
      add(Number.isInteger(delta.paperLive.paperBuildNumber), `exact Paper build number missing for ${version}`);
      add(isSha256(delta.paperLive.paperJarSha256), `exact Paper JAR digest missing for ${version}`);
      add(Number.isInteger(delta.paperLive.javaRuntimeMajor), `Paper Java runtime requirement missing for ${version}`);
      add(typeof delta.paperLive.mappingProfile === 'string' && delta.paperLive.mappingProfile.length > 0, `Paper mapping profile missing for ${version}`);
      add(isSha256(delta.paperLive.snapshotSchemaFingerprint), `Paper snapshot schema fingerprint missing for ${version}`);
    }
    if (delta.paperLive?.status === 'unavailable_verified') {
      add(isSha256(delta.paperLive.officialAvailabilityEvidenceSha256), `Paper unavailable evidence digest missing for ${version}`);
    }
    add(delta.paperLive?.report?.path === `${reportBase}/${version}/paper.json`, `Paper report path is not canonical for ${version}`);
    add((delta.paperLive?.status === 'unverified') === (delta.paperLive?.report?.status === 'pending'), `Paper status/report mismatch for ${version}`);
    if (delta.paperLive?.status !== 'unverified') {
      add(delta.paperLive?.report?.status === 'verified', `Paper evidence report is not verified for ${version}`);
      add(delta.paperLive?.report?.profileId === undefined, `Paper report pointer must not use a generic renderer profile field for ${version}`);
      add(isSha256(delta.paperLive?.report?.inputFingerprints?.target), `Paper target input fingerprint is missing for ${version}`);
      if (delta.previousStableRelease !== null) {
        add(isSha256(delta.paperLive?.report?.inputFingerprints?.baseline), `Paper baseline input fingerprint is missing for ${version}`);
      } else {
        add(delta.paperLive?.report?.inputFingerprints?.baseline === null, `Paper first-release report must not claim a prior-release fingerprint for ${version}`);
      }
    }
  }
  return errors;
}

export function validateVersionDeltaReadiness(deltaMatrix, versionMatrix) {
  const errors = validateVersionDeltaMatrix(deltaMatrix, versionMatrix);
  if (errors.length > 0) return errors;

  for (const entry of deltaMatrix.entries) {
    for (const artifactName of ['clientJar', 'serverJar', 'assetIndex']) {
      if (!isSha256(entry.artifacts?.[artifactName]?.downloadedSha256)) {
        errors.push(`${entry.minecraftVersion}: exact ${artifactName} artifact has no verified downloaded SHA-256`);
      }
    }
    for (const field of ['rendererAssets', 'savedAnvil', 'dynmapOracle', 'referenceParity']) {
      if (entry[field]?.status !== 'verified') {
        errors.push(`${entry.minecraftVersion}: ${field} delta report is not verified`);
      }
    }
    if (!['verified', 'unavailable_verified'].includes(entry.paperLive?.status)) {
      errors.push(`${entry.minecraftVersion}: Paper live compatibility is not verified or evidence-backed unavailable`);
    }
  }
  return errors;
}

const assetChangeFields = [
  'addedBlockIds', 'removedBlockIds', 'changedBlockIds', 'changedBlockStateProperties',
  'changedBlockstateSelectors', 'changedModelResolution', 'changedTextures',
  'changedBiomeTints', 'changedMaterials', 'changedLightingAndEmission',
  'addedRendererResourcePaths', 'removedRendererResourcePaths', 'changedRendererResourcePaths',
  'changedAssetSourceLocations',
];
const anvilChangeFields = [
  'dataVersion', 'dimensionHeight', 'regionCompression', 'chunkNbtFields', 'sectionLayout',
  'blockPaletteEncoding', 'biomePaletteEncoding', 'heightmaps', 'skyLight', 'blockLight', 'blockEntities',
];

const isStringArray = (value) => Array.isArray(value)
  && value.length > 0
  && value.every((item) => typeof item === 'string' && item.length > 0)
  && new Set(value).size === value.length;

function validateChangeRows(report, kind, fields, add) {
  const seenIds = new Set();
  for (const field of fields) {
    for (const [index, row] of (report?.changes?.[field] ?? []).entries()) {
      const label = `${kind} change ${field}[${index}]`;
      add(row !== null && typeof row === 'object' && !Array.isArray(row), `${label} must be a structured change record`);
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
      add(typeof row.changeId === 'string' && row.changeId.length > 0, `${label} has no stable changeId`);
      if (typeof row.changeId === 'string' && row.changeId.length > 0) {
        add(!seenIds.has(row.changeId), `${kind} changeId is duplicated: ${row.changeId}`);
        seenIds.add(row.changeId);
      }
      add(['renderer_input', 'provenance_only', 'non_renderer'].includes(row.renderImpact), `${label} has no valid renderImpact classification`);
      if (row.renderImpact === 'renderer_input') {
        add(isStringArray(row.fixtureIds), `${label} has no unique exact-version fixture IDs`);
        add(isStringArray(row.referenceTraceIds), `${label} has no unique exact-version Dynmap reference trace IDs`);
      } else if (row.renderImpact === 'provenance_only') {
        add(typeof row.reason === 'string' && row.reason.length > 0, `${label} provenance-only classification has no reason`);
        add(isStringArray(row.evidenceIds), `${label} provenance-only classification has no evidence IDs`);
      } else if (row.renderImpact === 'non_renderer') {
        add(typeof row.reason === 'string' && row.reason.length > 0, `${label} non-renderer classification has no reason`);
        add(row.rendererConsumerCount === 0, `${label} is classified non-renderer but has renderer consumers`);
        add(typeof row.consumerClosureEvidenceId === 'string' && row.consumerClosureEvidenceId.length > 0, `${label} has no consumer-closure evidence`);
      }
    }
  }
}

function collectRendererInputChanges(report, kind, fields) {
  return fields.flatMap((field) => (report?.changes?.[field] ?? [])
    .filter((row) => row?.renderImpact === 'renderer_input')
    .map((row) => ({ ...row, kind, field })));
}

export function validateVersionDeltaReport(report, { kind, version, baselineVersion, targetDigest, baselineDigest, additionalArtifactInputs = {}, expectedDynmapSourceSelection = null, pinnedDynmapRevision = '93b454efb8802dc7406d6873434f2aeec5c636f4' }) {
  const errors = [];
  const add = (condition, message) => { if (!condition) errors.push(message); };
  const expectedSchemaVersion = kind === 'assets' || kind === 'parity' ? 2 : 1;
  add(report?.schemaVersion === expectedSchemaVersion, `${kind} report schemaVersion must be ${expectedSchemaVersion}`);
  add(report?.kind === kind, `report kind must be ${kind}`);
  add(report?.profileId === undefined, `${kind} report must use axis-specific fingerprints or parity implementationProfile, not a generic profileId`);
  add(report?.minecraftVersion === version, `report exact release must be ${version}`);
  add((report?.baselineVersion ?? null) === baselineVersion, 'report comparison baseline does not match the exact previous release');
  add(isSha256(report?.extractor?.sha256), 'report extractor binary/source digest is missing');
  add(typeof report?.extractor?.revision === 'string' && report.extractor.revision.length > 0, 'report extractor revision is missing');
  add(isSha256(report?.fingerprints?.target), 'target input fingerprint is missing');
  if (baselineVersion !== null) add(isSha256(report?.fingerprints?.baseline), 'baseline input fingerprint is missing');
  add(report?.artifactInputs?.targetSha256 === targetDigest, 'target artifact digest is not bound to the version matrix');
  add(isSha256(targetDigest), 'target artifact digest is not verified SHA-256');
  if (baselineVersion !== null) add(report?.artifactInputs?.baselineSha256 === baselineDigest, 'baseline artifact digest is not bound to the previous release');
  if (baselineVersion !== null) add(isSha256(baselineDigest), 'baseline artifact digest is not verified SHA-256');
  for (const [name, digest] of Object.entries(additionalArtifactInputs)) {
    add(report?.artifactInputs?.[name] === digest && isSha256(digest), `${name} is not bound to its verified exact-release artifact digest`);
  }
  add(Array.isArray(report?.fixtureIds) && report.fixtureIds.length > 0, 'report must identify at least one immutable fixture');

  const changes = report?.changes;
  const changeFields = kind === 'assets' ? assetChangeFields : kind === 'anvil' ? anvilChangeFields : [];
  for (const field of changeFields) add(Array.isArray(changes?.[field]), `change list ${field} is missing`);
  if (changeFields.length > 0) {
    const changed = changeFields.some((field) => Array.isArray(changes?.[field]) && changes[field].length > 0);
    if (report?.comparisonResult === 'delta') add(changed, 'delta result has no concrete changes');
    if (report?.comparisonResult === 'no_renderer_visible_delta') {
      add(!changed, 'no-diff result contains concrete changes');
      add(report.fingerprints.target === report.fingerprints.baseline, 'no-diff result has unequal renderer/schema fingerprints');
    }
    if (baselineVersion === null) add(report?.comparisonResult === 'baseline_snapshot', 'first supported release must be an absolute baseline snapshot');
    else add(['delta', 'no_renderer_visible_delta'].includes(report?.comparisonResult), 'comparisonResult must be delta or no_renderer_visible_delta');
    validateChangeRows(report, kind, changeFields, add);
  }
  if (kind === 'assets') {
    for (const inventoryName of ['clientJarEntries', 'blockRegistry', 'blockStates', 'assetIndexObjects', 'canonicalResourceMap', 'resolvedModelGraph', 'rendererAssetClosure']) {
      const inventory = report?.inventories?.[inventoryName];
      add(typeof inventory?.path === 'string' && inventory.path.length > 0, `complete ${inventoryName} inventory path is missing`);
      add(isSha256(inventory?.sha256), `complete ${inventoryName} inventory digest is missing`);
      add(Number.isInteger(inventory?.itemCount) && inventory.itemCount >= 0, `complete ${inventoryName} inventory count is missing`);
    }
    const clientJarInventory = report?.inventories?.clientJarEntries;
    add(clientJarInventory?.targetClientJarSha256 === report?.artifactInputs?.targetSha256 && isSha256(clientJarInventory?.targetClientJarSha256), 'renderer client-JAR inventory is not bound to the exact target client JAR');
    if (baselineVersion !== null) {
      add(clientJarInventory?.baselineClientJarSha256 === report?.artifactInputs?.baselineSha256 && isSha256(clientJarInventory?.baselineClientJarSha256), 'renderer client-JAR inventory is not bound to the exact baseline client JAR');
    } else {
      add(clientJarInventory?.baselineClientJarSha256 === null, 'first-release client-JAR inventory must not claim a prior client JAR');
    }
    const objectInventory = report?.inventories?.assetIndexObjects;
    add(objectInventory?.targetAssetIndexSha256 === report?.artifactInputs?.targetAssetIndexSha256 && isSha256(objectInventory?.targetAssetIndexSha256), 'renderer asset-object inventory is not bound to the exact target asset index');
    if (baselineVersion !== null) {
      add(objectInventory?.baselineAssetIndexSha256 === report?.artifactInputs?.baselineAssetIndexSha256 && isSha256(objectInventory?.baselineAssetIndexSha256), 'renderer asset-object inventory is not bound to the exact baseline asset index');
    } else {
      add(objectInventory?.baselineAssetIndexSha256 === null, 'first-release asset-object inventory must not claim a prior asset index');
    }
    const canonicalResourceMap = report?.inventories?.canonicalResourceMap;
    const sourceRoots = canonicalResourceMap?.sourceRoots;
    add(Array.isArray(sourceRoots)
      && sourceRoots.length === 2
      && new Set(sourceRoots).size === 2
      && sourceRoots.includes('client_jar_entries')
      && sourceRoots.includes('asset_index_objects'), 'canonical resource map must account for both client JAR entries and asset-index objects');
    add(isSha256(canonicalResourceMap?.sourceResolutionPolicySha256), 'canonical resource map source-resolution policy digest is missing');
    add(canonicalResourceMap?.targetClientJarSha256 === report?.artifactInputs?.targetSha256 && isSha256(canonicalResourceMap?.targetClientJarSha256), 'canonical resource map is not bound to the exact target client JAR');
    add(canonicalResourceMap?.targetAssetIndexSha256 === report?.artifactInputs?.targetAssetIndexSha256 && isSha256(canonicalResourceMap?.targetAssetIndexSha256), 'canonical resource map is not bound to the exact target asset index');
    if (baselineVersion !== null) {
      add(canonicalResourceMap?.baselineClientJarSha256 === report?.artifactInputs?.baselineSha256 && isSha256(canonicalResourceMap?.baselineClientJarSha256), 'canonical resource map is not bound to the exact baseline client JAR');
      add(canonicalResourceMap?.baselineAssetIndexSha256 === report?.artifactInputs?.baselineAssetIndexSha256 && isSha256(canonicalResourceMap?.baselineAssetIndexSha256), 'canonical resource map is not bound to the exact baseline asset index');
    } else {
      add(canonicalResourceMap?.baselineClientJarSha256 === null, 'first-release canonical resource map must not claim a prior client JAR');
      add(canonicalResourceMap?.baselineAssetIndexSha256 === null, 'first-release canonical resource map must not claim a prior asset index');
    }
    const coverage = report?.coverage;
    add(coverage?.unmappedRegistryBlockCount === 0, 'some registered blocks are not mapped to renderer behavior');
    add(coverage?.unresolvedBlockStateCount === 0, 'some renderer-visible block states are unresolved');
    add(coverage?.missingModelCount === 0 && coverage?.missingTextureCount === 0, 'asset closure has missing model or texture inputs');
    add(coverage?.unresolvedRendererResourcePathCount === 0, 'some renderer resource paths have no verified source bytes');
    add(coverage?.ambiguousRendererAssetSourceCount === 0, 'some renderer resource paths have ambiguous source locations');
    add(coverage?.duplicateLogicalPathConflictCount === 0, 'client JAR and asset index contain conflicting bytes for a logical resource path');
    add(coverage?.unverifiedClientJarEntryCount === 0, 'renderer-consumed client JAR entries are missing verified bytes/digests');
    add(coverage?.unverifiedRendererAssetObjectCount === 0, 'renderer-consumed asset objects are missing verified bytes/digests');
    const changedStates = [...(changes?.addedBlockIds ?? []), ...(changes?.changedBlockIds ?? []), ...(changes?.changedBlockStateProperties ?? [])];
    for (const state of changedStates) {
      add(typeof state === 'object' && typeof state.blockId === 'string', 'changed/new block state must identify its exact block ID');
      add(Array.isArray(state?.resolvedModels) && state.resolvedModels.length > 0, `changed/new block state is not linked to resolved models: ${state?.blockId ?? 'unknown'}`);
      add(Array.isArray(state?.textureDigests) && state.textureDigests.length > 0, `changed/new block state is not linked to exact texture digests: ${state?.blockId ?? 'unknown'}`);
      add(Array.isArray(state?.fixtureIds) && state.fixtureIds.length > 0, `changed/new block state has no fixture: ${state?.blockId ?? 'unknown'}`);
      add(Array.isArray(state?.referenceTraceIds) && state.referenceTraceIds.length > 0, `changed/new block state has no Dynmap reference trace: ${state?.blockId ?? 'unknown'}`);
    }
  }
  if (kind === 'anvil') {
    add(isSha256(report?.schemaFingerprint), 'Anvil schema fingerprint is missing');
    add(report?.fixtureProvenance?.source === 'exact_version_server_generated_or_captured_world', 'Anvil fixture is not bound to an exact-version world source');
    add(typeof report?.fixtureProvenance?.dataVersion === 'number', 'Anvil fixture DataVersion is missing');
    add(typeof report?.fixtureProvenance?.minY === 'number' && typeof report?.fixtureProvenance?.maxY === 'number', 'Anvil fixture dimension height is missing');
  }
  if (kind === 'parity') {
    add(Array.isArray(report?.referenceTraceIds) && report.referenceTraceIds.length > 0, 'parity report has no Java reference trace');
    add(Array.isArray(report?.pixelComparisons) && report.pixelComparisons.length > 0, 'parity report has no pixel comparison');
    add(new Set(report?.referenceTraceIds ?? []).size === (report?.referenceTraceIds ?? []).length, 'parity report contains duplicate reference trace IDs');
    const comparisonIds = new Set();
    for (const comparison of report?.pixelComparisons ?? []) {
      add(typeof comparison.comparisonId === 'string' && comparison.comparisonId.length > 0, 'pixel comparison has no stable comparisonId');
      if (typeof comparison.comparisonId === 'string') {
        add(!comparisonIds.has(comparison.comparisonId), `pixel comparison ID is duplicated: ${comparison.comparisonId}`);
        comparisonIds.add(comparison.comparisonId);
      }
      add(typeof comparison.referenceTraceId === 'string' && (report.referenceTraceIds ?? []).includes(comparison.referenceTraceId), 'pixel comparison is not bound to a listed Java reference trace');
      add(typeof comparison.fixtureId === 'string' && comparison.fixtureId.length > 0, 'pixel comparison has no exact-version fixture ID');
      add(isSha256(comparison.referencePngSha256) && isSha256(comparison.rustPngSha256), 'pixel comparison is missing exact PNG digests');
      add(comparison.differingPixelCount === 0, 'pixel parity has differing pixels');
    }
    const profile = report?.implementationProfile;
    add(['baseline', 'shared_existing_profile', 'new_adapter'].includes(profile?.decision), 'parity report has no valid implementation-profile decision');
    add(typeof profile?.id === 'string' && profile.id.length > 0, 'parity report implementation profile ID is missing');
    if (baselineVersion === null) {
      add(profile?.decision === 'baseline', 'first supported release must establish a baseline implementation profile');
      add(profile?.comparedAgainstRelease === null && profile?.previousProfileId === null, 'baseline implementation profile must not claim a previous release/profile');
      add(profile?.adapterOwnerPhaseId === null && profile?.behaviorGapEvidence === null, 'baseline profile cannot claim a version-specific behavior-gap adapter');
    } else {
      add(profile?.decision !== 'baseline', 'later release cannot establish a second baseline implementation profile');
      add(profile?.comparedAgainstRelease === baselineVersion, 'implementation profile decision is not bound to the immediately previous release');
      add(typeof profile?.previousProfileId === 'string' && profile.previousProfileId.length > 0, 'implementation profile decision has no previous profile ID');
      if (profile?.decision === 'shared_existing_profile') {
        add(profile.id === profile.previousProfileId, 'shared implementation profile ID differs from the previous release');
        add(profile?.adapterOwnerPhaseId === null && profile?.behaviorGapEvidence === null, 'shared profile cannot claim a new adapter or behavior-gap exception');
      }
      if (profile?.decision === 'new_adapter') {
        add(profile.id !== profile.previousProfileId, 'new adapter decision reuses the previous implementation profile ID');
        add(typeof profile?.adapterOwnerPhaseId === 'string' && profile.adapterOwnerPhaseId.length > 0, 'new adapter decision has no implementation owner phase');
        const gap = profile?.behaviorGapEvidence;
        add(typeof gap?.changeId === 'string' && gap.changeId.length > 0, 'new adapter decision has no concrete changed-input ID');
        add(typeof gap?.description === 'string' && gap.description.length > 0, 'new adapter decision has no observed behavior-gap description');
        add(typeof gap?.fixtureId === 'string' && gap.fixtureId.length > 0, 'new adapter decision has no reproducing fixture ID');
        add(typeof gap?.referenceTraceId === 'string' && gap.referenceTraceId.length > 0, 'new adapter decision has no Dynmap reference trace ID');
        add(typeof gap?.rustFailureEvidenceId === 'string' && gap.rustFailureEvidenceId.length > 0, 'new adapter decision has no pre-adapter Rust failure evidence');
        add(/^[a-f0-9]{40}$/.test(gap?.adapterCommitSha ?? ''), 'new adapter decision has no committed adapter implementation digest');
      }
    }
    add(Array.isArray(report?.changeCoverage), 'parity report has no per-change parity coverage list');
  }
  if (kind === 'paper') {
    add(['verified', 'unavailable_verified'].includes(report?.liveCompatibility), 'Paper live compatibility must be verified or evidence-backed unavailable');
    if (report?.liveCompatibility === 'verified') {
      add(Number.isInteger(report?.paperBuild?.buildNumber), 'exact Paper build number is missing');
      add(isSha256(report?.paperBuild?.jarSha256), 'exact Paper JAR SHA-256 is missing');
      add(Array.isArray(report?.snapshotFixtures) && report.snapshotFixtures.some((fixture) => fixture.status === 'loaded') && report.snapshotFixtures.some((fixture) => fixture.status === 'not_loaded'), 'Paper report must cover loaded and not_loaded snapshots');
    }
    if (report?.liveCompatibility === 'unavailable_verified') {
      add(typeof report?.unavailableReason === 'string' && report.unavailableReason.length > 0, 'Paper-unavailable result has no exact reason');
      add(isSha256(report?.officialAvailabilityEvidenceSha256), 'Paper-unavailable result has no official evidence digest');
    }
  }
  if (kind === 'dynmap-oracle') {
    const source = report?.sourceSelection;
    add(source?.repository === 'https://github.com/webbukkit/dynmap', 'oracle source repository is not the fixed Dynmap repository');
    add(source?.baselineRevision === pinnedDynmapRevision, 'oracle report is not bound to the pinned Dynmap baseline');
    add(/^[a-f0-9]{40}$/.test(source?.selectedRevision ?? ''), 'selected exact-version Dynmap source revision is missing');
    add(isSha256(source?.selectedSourceTreeSha256), 'selected Dynmap source tree digest is missing');
    add(isSha256(source?.referenceBuildSha256), 'selected Java reference build digest is missing');
    add(isSha256(source?.baselineSourceTreeSha256), 'baseline Dynmap source tree digest is missing');
    if (expectedDynmapSourceSelection) {
      for (const key of ['repository', 'baselineRevision', 'baselineSourceTreeSha256', 'selectedRevision', 'selectedSourceTreeSha256', 'referenceBuildSha256', 'sourceDeltaManifestSha256']) {
        add(source?.[key] === expectedDynmapSourceSelection[key], `Dynmap source selection ${key} does not match the exact-release matrix`);
      }
    }
    add(Array.isArray(source?.exactVersionSupportEvidence) && source.exactVersionSupportEvidence.length > 0, 'exact-version Dynmap support evidence is missing');
    for (const evidence of source?.exactVersionSupportEvidence ?? []) {
      add(evidence.minecraftVersion === version, 'Dynmap support evidence targets a different Minecraft release');
      add(typeof evidence.sourcePath === 'string' && evidence.sourcePath.length > 0, 'Dynmap support evidence source path is missing');
      add(typeof evidence.behavior === 'string' && evidence.behavior.length > 0, 'Dynmap support evidence does not identify a concrete behavior');
      add(isSha256(evidence.sourceFileSha256), 'Dynmap support source file digest is missing');
    }
    const delta = report?.sourceDeltaFromBaseline;
    add(typeof delta?.path === 'string' && delta.path.length > 0, 'Dynmap source delta manifest path is missing');
    add(delta?.path === `spec/map/evidence/version-deltas/${version}/dynmap-source-delta.json`, 'Dynmap source delta manifest path is not canonical for this exact release');
    add(isSha256(delta?.sha256), 'Dynmap source delta manifest digest is missing');
    add(delta?.sha256 === source?.sourceDeltaManifestSha256, 'Dynmap source delta manifest digest does not match the exact-release matrix source selection');
    add(Number.isInteger(delta?.rendererRelevantAddedSymbolCount) && delta.rendererRelevantAddedSymbolCount >= 0, 'added renderer source symbol count is missing');
    add(Number.isInteger(delta?.rendererRelevantRemovedSymbolCount) && delta.rendererRelevantRemovedSymbolCount >= 0, 'removed renderer source symbol count is missing');
    add(Number.isInteger(delta?.rendererRelevantChangedSymbolCount) && delta.rendererRelevantChangedSymbolCount >= 0, 'changed renderer source symbol count is missing');
    add(Number.isInteger(delta?.rendererRelevantAddedResourceCount) && delta.rendererRelevantAddedResourceCount >= 0, 'added renderer resource count is missing');
    add(Number.isInteger(delta?.rendererRelevantRemovedResourceCount) && delta.rendererRelevantRemovedResourceCount >= 0, 'removed renderer resource count is missing');
    add(Number.isInteger(delta?.rendererRelevantChangedResourceCount) && delta.rendererRelevantChangedResourceCount >= 0, 'changed renderer resource count is missing');
    add(delta?.unclassifiedRendererRelevantChangeCount === 0, 'some renderer-relevant Dynmap source changes are unclassified');
    const coverage = report?.targetVersionCoverage;
    add(coverage?.newBlockIdsWithoutRendererMapping === 0, 'new block IDs lack renderer mappings for this release');
    add(coverage?.changedBlockStatesWithoutRendererMapping === 0, 'changed block states lack renderer mappings for this release');
    add(coverage?.unresolvedRendererAssetReferences === 0, 'renderer asset references remain unresolved for this release');
    add(coverage?.unsupportedBuiltInRendererCases === 0, 'built-in renderer cases remain unsupported for this release');
    add(coverage?.unaccountedRendererVisibleChanges === 0, 'renderer-visible release changes remain unaccounted for');
  }
  return errors;
}

export function validateReleaseDeltaParityCoverage({ version, baselineVersion, assetsReport, anvilReport, parityReport, previousParityReport = null }) {
  const errors = [];
  const add = (condition, message) => { if (!condition) errors.push(message); };
  add(assetsReport?.kind === 'assets', `${version}: exact-release asset delta report is missing`);
  add(anvilReport?.kind === 'anvil', `${version}: exact-release Anvil delta report is missing`);
  add(parityReport?.kind === 'parity', `${version}: exact-release parity report is missing`);
  const changes = [
    ...collectRendererInputChanges(assetsReport, 'assets', assetChangeFields),
    ...collectRendererInputChanges(anvilReport, 'anvil', anvilChangeFields),
  ];
  const expectedById = new Map();
  for (const change of changes) {
    add(!expectedById.has(change.changeId), `renderer-input changeId is duplicated across asset/Anvil reports: ${change.changeId}`);
    expectedById.set(change.changeId, change);
  }

  const coverageRows = parityReport?.changeCoverage;
  add(Array.isArray(coverageRows), `${version}: parity report has no changeCoverage array`);
  const coverageById = new Map();
  for (const [index, row] of (coverageRows ?? []).entries()) {
    add(typeof row?.changeId === 'string' && row.changeId.length > 0, `${version}: changeCoverage[${index}] has no changeId`);
    if (typeof row?.changeId !== 'string') continue;
    add(!coverageById.has(row.changeId), `${version}: duplicate parity coverage for ${row.changeId}`);
    coverageById.set(row.changeId, row);
    const sourceChange = expectedById.get(row.changeId);
    add(Boolean(sourceChange), `${version}: parity coverage references an unknown renderer-input change ${row.changeId}`);
    if (!sourceChange) continue;
    const coveredFixtureIds = Array.isArray(row.fixtureIds) ? row.fixtureIds : [];
    const coveredTraceIds = Array.isArray(row.referenceTraceIds) ? row.referenceTraceIds : [];
    const pixelComparisonIds = Array.isArray(row.pixelComparisonIds) ? row.pixelComparisonIds : [];
    add(same([...coveredFixtureIds].sort(), [...(sourceChange.fixtureIds ?? [])].sort()), `${version}: fixture coverage does not exactly match change ${row.changeId}`);
    add(same([...coveredTraceIds].sort(), [...(sourceChange.referenceTraceIds ?? [])].sort()), `${version}: Dynmap trace coverage does not exactly match change ${row.changeId}`);
    add(isStringArray(row.pixelComparisonIds), `${version}: change ${row.changeId} has no exact pixel-comparison IDs`);
    for (const comparisonId of pixelComparisonIds) {
      const comparison = (parityReport?.pixelComparisons ?? []).find((candidate) => candidate.comparisonId === comparisonId);
      add(Boolean(comparison), `${version}: change ${row.changeId} references missing pixel comparison ${comparisonId}`);
      if (comparison) add((sourceChange.referenceTraceIds ?? []).includes(comparison.referenceTraceId), `${version}: pixel comparison ${comparisonId} uses a trace outside change ${row.changeId}`);
      if (comparison) add((sourceChange.fixtureIds ?? []).includes(comparison.fixtureId), `${version}: pixel comparison ${comparisonId} uses a fixture outside change ${row.changeId}`);
    }
  }
  add(same([...coverageById.keys()].sort(), [...expectedById.keys()].sort()), `${version}: every renderer-input change must have exactly one parity coverage row`);

  const profile = parityReport?.implementationProfile;
  if (baselineVersion === null) {
    add(profile?.decision === 'baseline', `${version}: first release must record a baseline implementation profile`);
    add(previousParityReport === null, `${version}: baseline release unexpectedly has a previous parity report`);
  } else {
    const previousProfile = previousParityReport?.implementationProfile;
    add(Boolean(previousProfile), `${version}: previous exact release has no verified implementation-profile decision`);
    add(profile?.previousProfileId === previousProfile?.id, `${version}: parity report does not name the immediately previous verified implementation profile`);
    if (profile?.decision === 'shared_existing_profile') {
      add(profile?.id === previousProfile?.id, `${version}: shared profile does not match the immediately previous verified release`);
    } else if (profile?.decision === 'new_adapter') {
      const gap = profile?.behaviorGapEvidence;
      const change = expectedById.get(gap?.changeId);
      add(profile?.id !== previousProfile?.id, `${version}: new adapter profile is not distinct from the prior profile`);
      add(Boolean(change), `${version}: adapter behavior gap does not identify a renderer-input delta in this release`);
      if (change) {
        add((change.fixtureIds ?? []).includes(gap?.fixtureId), `${version}: adapter gap fixture is not linked to its changed input`);
        add((change.referenceTraceIds ?? []).includes(gap?.referenceTraceId), `${version}: adapter gap reference trace is not linked to its changed input`);
      }
    } else {
      add(false, `${version}: later release must share the verified prior profile or prove a new adapter boundary`);
    }
  }
  return errors;
}

export function validateDynmapSourceDeltaManifest(manifest, { version, sourceSelection, report }) {
  const errors = [];
  const add = (condition, message) => { if (!condition) errors.push(message); };
  add(manifest?.schemaVersion === 1, 'Dynmap source-delta manifest schemaVersion must be 1');
  add(manifest?.minecraftVersion === version, 'Dynmap source-delta manifest targets a different exact release');
  add(manifest?.baselineSource?.revision === sourceSelection?.baselineRevision, 'source-delta baseline revision does not match the selected oracle');
  add(manifest?.baselineSource?.treeSha256 === sourceSelection?.baselineSourceTreeSha256 && isSha256(manifest?.baselineSource?.treeSha256), 'source-delta baseline tree digest does not match the selected oracle');
  add(manifest?.selectedSource?.revision === sourceSelection?.selectedRevision, 'source-delta selected revision does not match the selected oracle');
  add(manifest?.selectedSource?.treeSha256 === sourceSelection?.selectedSourceTreeSha256 && isSha256(manifest?.selectedSource?.treeSha256), 'source-delta selected tree digest does not match the selected oracle');

  const inventory = manifest?.inventory;
  for (const key of ['baselineJavaAstSha256', 'selectedJavaAstSha256', 'baselineResourceInventorySha256', 'selectedResourceInventorySha256']) {
    add(isSha256(inventory?.[key]), `source-delta ${key} is missing`);
  }
  for (const key of ['comparedJavaFileCount', 'comparedJavaDeclarationCount', 'comparedResourceCount']) {
    add(Number.isInteger(inventory?.[key]) && inventory[key] >= 0, `source-delta ${key} is invalid`);
  }
  add(inventory?.comparedJavaFileCount > 0, 'source-delta did not compare any Java source files');
  add(inventory?.comparedJavaDeclarationCount > 0, 'source-delta did not compare any Java declarations');

  const changeGroups = [
    ['addedRendererSymbols', 'rendererRelevantAddedSymbolCount', 'symbol'],
    ['removedRendererSymbols', 'rendererRelevantRemovedSymbolCount', 'symbol'],
    ['changedRendererSymbols', 'rendererRelevantChangedSymbolCount', 'symbol'],
    ['addedRendererResources', 'rendererRelevantAddedResourceCount', 'resource'],
    ['removedRendererResources', 'rendererRelevantRemovedResourceCount', 'resource'],
    ['changedRendererResources', 'rendererRelevantChangedResourceCount', 'resource'],
  ];
  for (const [group, countField, type] of changeGroups) {
    const rows = manifest?.changes?.[group];
    add(Array.isArray(rows), `source-delta change list ${group} is missing`);
    if (!Array.isArray(rows)) continue;
    if (type === 'symbol') {
      add(rows.length === report?.sourceDeltaFromBaseline?.[countField], `${group} count does not match the Dynmap oracle report`);
      for (const row of rows) {
        add(typeof row?.symbolId === 'string' && row.symbolId.length > 0, `${group} row has no stable symbol ID`);
        add(typeof row?.sourcePath === 'string' && row.sourcePath.length > 0, `${group} row has no source path`);
        add(typeof row?.rustDestination === 'string' && row.rustDestination.length > 0, `${group} row has no Rust destination`);
        add(isSha256(row?.beforeSha256) || row?.beforeSha256 === null, `${group} row has invalid before digest`);
        add(isSha256(row?.afterSha256) || row?.afterSha256 === null, `${group} row has invalid after digest`);
        add(Array.isArray(row?.fixtureIds) && row.fixtureIds.length > 0, `${group} row has no fixture IDs`);
        add(Array.isArray(row?.referenceTraceIds) && row.referenceTraceIds.length > 0, `${group} row has no reference trace IDs`);
      }
    } else {
      add(rows.length === report?.sourceDeltaFromBaseline?.[countField], `${group} count does not match the Dynmap oracle report`);
      for (const row of rows) {
        add(typeof row?.resourcePath === 'string' && row.resourcePath.length > 0, `${group} row has no resource path`);
        add(isSha256(row?.beforeSha256) || row?.beforeSha256 === null, `${group} row has invalid before digest`);
        add(isSha256(row?.afterSha256) || row?.afterSha256 === null, `${group} row has invalid after digest`);
        add(Array.isArray(row?.consumerSymbolIds) && row.consumerSymbolIds.length > 0, `${group} row has no renderer consumer symbol IDs`);
        add(Array.isArray(row?.fixtureIds) && row.fixtureIds.length > 0, `${group} row has no fixture IDs`);
        add(Array.isArray(row?.referenceTraceIds) && row.referenceTraceIds.length > 0, `${group} row has no reference trace IDs`);
      }
    }
  }

  const coverage = manifest?.coverage;
  add(coverage?.unclassifiedRendererRelevantChangeCount === 0, 'source-delta manifest has unclassified renderer-relevant changes');
  add(coverage?.newBlockIdsWithoutRendererMapping === 0 && coverage?.newBlockIdsWithoutRendererMapping === report?.targetVersionCoverage?.newBlockIdsWithoutRendererMapping, 'source-delta new block mapping coverage is incomplete or disagrees with the oracle report');
  add(coverage?.changedBlockStatesWithoutRendererMapping === 0 && coverage?.changedBlockStatesWithoutRendererMapping === report?.targetVersionCoverage?.changedBlockStatesWithoutRendererMapping, 'source-delta changed block-state mapping coverage is incomplete or disagrees with the oracle report');
  add(coverage?.unresolvedRendererAssetReferences === 0 && coverage?.unresolvedRendererAssetReferences === report?.targetVersionCoverage?.unresolvedRendererAssetReferences, 'source-delta asset-reference coverage is incomplete or disagrees with the oracle report');
  add(coverage?.unsupportedBuiltInRendererCases === 0 && coverage?.unsupportedBuiltInRendererCases === report?.targetVersionCoverage?.unsupportedBuiltInRendererCases, 'source-delta built-in renderer coverage is incomplete or disagrees with the oracle report');
  add(coverage?.unaccountedRendererVisibleChanges === 0 && coverage?.unaccountedRendererVisibleChanges === report?.targetVersionCoverage?.unaccountedRendererVisibleChanges, 'source-delta renderer-visible change coverage is incomplete or disagrees with the oracle report');
  add(coverage?.unclassifiedRendererRelevantChangeCount === report?.sourceDeltaFromBaseline?.unclassifiedRendererRelevantChangeCount, 'source-delta classification count disagrees with the oracle report');
  return errors;
}

async function run() {
  const mode = process.argv[2];
  if (mode !== '--write' && mode !== '--check') throw new Error('Pass exactly one of --write or --check');
  const matrix = JSON.parse(await readFile(matrixPath, 'utf8'));
  const expected = `${JSON.stringify(createVersionDeltaMatrix(matrix), null, 2)}\n`;
  if (mode === '--write') {
    await writeFile(deltaPath, expected, 'utf8');
  } else {
    const actual = await readFile(deltaPath, 'utf8').catch(() => null);
    if (actual !== expected) throw new Error('Version delta matrix is missing or stale; regenerate only after reviewing the exact release metadata.');
  }
  console.log(`${mode === '--write' ? 'Wrote' : 'Verified'} ${matrix.entries.length} pending exact-release delta records. Pending means not version-supported yet.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await run();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
