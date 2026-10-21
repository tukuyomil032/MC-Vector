#!/usr/bin/env node

import { access, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { validateDynmapSourceDeltaManifest, validateReleaseDeltaParityCoverage, validateVersionDeltaMatrix, validateVersionDeltaReport } from './version-delta-matrix.mjs';
import { validatePhaseDocument, validatePhaseGraph } from './phase-graph.mjs';
import { verifyVersionSnapshot } from './version-snapshot-integrity.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const planRoot = resolve(scriptDir, '..');
const repoRoot = resolve(planRoot, '../../..');
const pinnedRevision = '93b454efb8802dc7406d6873434f2aeec5c636f4';
const stageNames = ['assets', 'anvil', 'paper-snapshot', 'reference-and-parity', 'real-acceptance'];
const args = process.argv.slice(2);
const supportedFlags = new Set([
  '--require-plan-complete',
  '--require-renderer-complete',
  '--require-dynmap-oracle',
  '--require-source-closure',
  '--require-resource-closure',
]);
if (args.includes('--help')) {
  console.log([
    'Usage: bun spec/map/plan/tools/validate-plan.mjs [flags]',
    '  --require-plan-complete     Require every inventoried item to have concrete phase ownership; open semantic work must be counted and assigned.',
    '  --require-source-closure    Require zero unresolved pinned-source reference candidates.',
    '  --require-resource-closure  Require verified resource consumer closure.',
    '  --require-renderer-complete Require strict source/resource closure plus runtime implementation/reference/acceptance evidence.',
    '  --require-dynmap-oracle     Verify exact-release Dynmap source/report artifacts.',
  ].join('\n'));
  process.exit(0);
}
const unknownArgs = args.filter((arg) => !supportedFlags.has(arg));
if (unknownArgs.length > 0) {
  console.error(`Unknown argument(s): ${unknownArgs.join(', ')}`);
  process.exit(2);
}
const requirePlanComplete = args.includes('--require-plan-complete');
const requireRendererComplete = args.includes('--require-renderer-complete');
const requireDynmapOracle = args.includes('--require-dynmap-oracle');
const requireSemanticClosure = args.includes('--require-source-closure') || requireRendererComplete;
const requireResourceClosure = args.includes('--require-resource-closure') || requireRendererComplete;
const errors = [];
const expect = (condition, message) => { if (!condition) errors.push(message); };
const readJson = async (path) => JSON.parse(await readFile(resolve(repoRoot, path), 'utf8'));
const exists = async (path) => access(path).then(() => true, () => false);

const walk = async (root) => {
  const paths = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) paths.push(...await walk(path));
    else paths.push(path);
  }
  return paths;
};

const sourceCatalog = await readJson('spec/map/coverage/source-symbols.json');
const resources = await readJson('spec/map/coverage/resources.json');
const builtins = await readJson('spec/map/coverage/builtin-renderers.json');
const versions = await readJson('spec/map/coverage/version-matrix.json');
const versionDeltas = await readJson('spec/map/coverage/version-delta-matrix.json');
const sourceMap = await readJson('spec/map/plan/coverage/source-phase-map.json');
const phaseGraph = await readJson('spec/map/plan/coverage/phase-graph.json');
const astInventoryBytes = await readFile(resolve(repoRoot, 'spec/map/coverage/java-ast-inventory.json.gz')).catch(() => null);
const astInventory = astInventoryBytes ? JSON.parse(gunzipSync(astInventoryBytes).toString('utf8')) : null;
const resourceInventoryBytes = await readFile(resolve(repoRoot, 'spec/map/coverage/pinned-resource-inventory.json.gz')).catch(() => null);
const resourceInventory = resourceInventoryBytes ? JSON.parse(gunzipSync(resourceInventoryBytes).toString('utf8')) : null;
expect(sourceCatalog.entries.length > 0, 'source candidate catalog is empty');
expect(resources.entries.length > 0, 'resource candidate catalog is empty');
expect(builtins.entries.length > 0, 'built-in candidate catalog is empty');
expect(versions.entries.length > 0, 'version matrix is empty');
expect(versions.entries[0]?.minecraftVersion === versions.range.minimum, 'version matrix minimum does not match recorded range');
expect(versions.entries.at(-1)?.minecraftVersion === versions.range.maximum, 'version matrix maximum does not match recorded range');
expect(versions.snapshotDate === '2026-09-23', 'version snapshot audit date is missing or unexpected');
expect(versions.latestStableReleaseAtSnapshot?.id === versions.range.maximum, 'latest stable snapshot evidence does not match version matrix maximum');
expect(new Set(versions.entries.map((entry) => entry.minecraftVersion)).size === versions.entries.length, 'version matrix contains duplicate exact release IDs');
const paperListing = versions.paperVersionListingSnapshot;
expect(paperListing?.auditedAt === versions.snapshotDate, 'Paper version listing snapshot date does not match version matrix snapshot');
const paperListed = paperListing?.listedExactMinecraftVersions ?? [];
const paperNotListed = paperListing?.exactMinecraftVersionsNotListed ?? [];
expect(new Set([...paperListed, ...paperNotListed]).size === paperListed.length + paperNotListed.length, 'Paper version listing has duplicate or overlapping exact version IDs');
expect(JSON.stringify([...paperListed, ...paperNotListed].sort()) === JSON.stringify(versions.entries.map((entry) => entry.minecraftVersion).sort()), 'Paper version listing does not partition the exact Minecraft version matrix');
expect(paperListing?.buildAndArtifactDigestsVerified === false, 'Paper listing must not imply build or artifact verification');
for (const catalog of [sourceCatalog, resources, builtins]) expect(catalog.sourceRevision === pinnedRevision, 'source catalog does not use the pinned Dynmap revision');
expect(sourceMap.entries.length === sourceCatalog.entries.length, 'source-to-phase map does not cover every source candidate');
expect(astInventory?.sourceRevision === pinnedRevision, 'pinned Java AST inventory is missing or bound to a different revision');
expect(resourceInventory?.sourceRevision === pinnedRevision, 'pinned resource path inventory is missing or bound to a different revision');
expect(astInventory?.sourceTreeSha1 === resourceInventory?.sourceTreeSha1, 'Java and resource inventories do not identify the same pinned Git tree');
for (const error of validateVersionDeltaMatrix(versionDeltas, versions)) errors.push(`version delta matrix: ${error}`);
const rendererDataDeltaDetail = 'phase-details/phase-002-renderer-data-delta.md';
expect(await exists(resolve(planRoot, rendererDataDeltaDetail)), 'P-002 renderer/Anvil data-delta detail is missing');
const phaseIndexBody = await readFile(resolve(planRoot, 'phase-index.md'), 'utf8');
expect(phaseIndexBody.includes(rendererDataDeltaDetail), 'phase index does not link the renderer/Anvil data-delta detail');
const evidenceRoot = resolve(repoRoot, 'spec/map/evidence/version-deltas');
const digestBytes = (bytes) => createHash('sha256').update(bytes).digest('hex');
const exactArtifactDigest = (deltaEntry, artifactName) => deltaEntry?.artifacts?.[artifactName]?.downloadedSha256 ?? null;
const referenceInputDigest = (deltaEntry) => {
  const values = ['clientJar', 'serverJar', 'assetIndex'].map((name) => exactArtifactDigest(deltaEntry, name));
  return values.every((value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))
    ? digestBytes(Buffer.from(JSON.stringify(values), 'utf8'))
    : null;
};
const parityReportsByVersion = new Map();
for (let index = 0; index < versionDeltas.entries.length; index += 1) {
  const entry = versionDeltas.entries[index];
  const baseline = versionDeltas.entries[index - 1] ?? null;
  const reports = [
    { field: 'rendererAssets', kind: 'assets', targetArtifact: 'clientJar', extraArtifact: 'assetIndex' },
    { field: 'savedAnvil', kind: 'anvil', targetArtifact: 'serverJar' },
    { field: 'dynmapOracle', kind: 'dynmap-oracle', targetArtifact: null, dynmapOracle: true },
    { field: 'referenceParity', kind: 'parity', targetArtifact: null },
  ];
  const loadedReports = new Map();
  for (const spec of reports) {
    const record = entry[spec.field];
    if (record?.status !== 'verified') continue;
    const canonicalPrefix = `spec/map/evidence/version-deltas/${entry.minecraftVersion}/`;
    expect(typeof record.path === 'string' && record.path.startsWith(canonicalPrefix) && !record.path.split('/').includes('..'), `${spec.field} evidence path escapes its exact-version evidence directory: ${entry.minecraftVersion}`);
    if (typeof record.path !== 'string' || !record.path.startsWith(canonicalPrefix) || record.path.split('/').includes('..')) continue;
    const reportPath = resolve(repoRoot, record.path);
    expect(reportPath.startsWith(`${evidenceRoot}/`), `${spec.field} report is outside version-delta evidence root: ${entry.minecraftVersion}`);
    const reportBytes = await readFile(reportPath).catch(() => null);
    expect(Boolean(reportBytes), `${spec.field} report file is missing for ${entry.minecraftVersion}`);
    if (!reportBytes) continue;
    expect(digestBytes(reportBytes) === record.sha256, `${spec.field} report file digest mismatch for ${entry.minecraftVersion}`);
    let report;
    try { report = JSON.parse(reportBytes.toString('utf8')); } catch { errors.push(`${spec.field} report is invalid JSON for ${entry.minecraftVersion}`); continue; }
    loadedReports.set(spec.kind, report);
    if (spec.kind === 'parity') parityReportsByVersion.set(entry.minecraftVersion, report);
    const targetDigest = spec.targetArtifact ? exactArtifactDigest(entry, spec.targetArtifact) : referenceInputDigest(entry);
    const baselineDigest = spec.targetArtifact && baseline ? exactArtifactDigest(baseline, spec.targetArtifact) : baseline ? referenceInputDigest(baseline) : null;
    const additionalArtifactInputs = spec.extraArtifact ? {
      targetAssetIndexSha256: exactArtifactDigest(entry, spec.extraArtifact),
      ...(baseline ? { baselineAssetIndexSha256: exactArtifactDigest(baseline, spec.extraArtifact) } : {}),
    } : {};
    if (spec.dynmapOracle) {
      additionalArtifactInputs.targetDynmapSourceTreeSha256 = record.sourceSelection?.selectedSourceTreeSha256;
      additionalArtifactInputs.baselineDynmapSourceTreeSha256 = record.sourceSelection?.baselineSourceTreeSha256;
    }
    for (const error of validateVersionDeltaReport(report, {
      kind: spec.kind,
      version: entry.minecraftVersion,
      baselineVersion: baseline?.minecraftVersion ?? null,
      targetDigest,
      baselineDigest,
      additionalArtifactInputs,
      ...(spec.dynmapOracle ? { expectedDynmapSourceSelection: record.sourceSelection } : {}),
    })) errors.push(`${spec.field} report ${entry.minecraftVersion}: ${error}`);
    if (spec.dynmapOracle) {
      const sourceDeltaPath = report.sourceDeltaFromBaseline?.path;
      const canonicalSourceDeltaPath = `spec/map/evidence/version-deltas/${entry.minecraftVersion}/dynmap-source-delta.json`;
      if (sourceDeltaPath !== canonicalSourceDeltaPath) continue;
      const sourceDeltaBytes = await readFile(resolve(repoRoot, sourceDeltaPath)).catch(() => null);
      expect(Boolean(sourceDeltaBytes), `Dynmap source-delta manifest file is missing for ${entry.minecraftVersion}`);
      if (!sourceDeltaBytes) continue;
      expect(digestBytes(sourceDeltaBytes) === report.sourceDeltaFromBaseline.sha256, `Dynmap source-delta manifest digest mismatch for ${entry.minecraftVersion}`);
      try {
        const sourceDelta = JSON.parse(sourceDeltaBytes.toString('utf8'));
        for (const error of validateDynmapSourceDeltaManifest(sourceDelta, {
          version: entry.minecraftVersion,
          sourceSelection: record.sourceSelection,
          report,
        })) errors.push(`Dynmap source-delta manifest ${entry.minecraftVersion}: ${error}`);
      } catch (error) {
        if (error instanceof SyntaxError) errors.push(`Dynmap source-delta manifest is invalid JSON for ${entry.minecraftVersion}`);
        else errors.push(`Dynmap source-delta manifest ${entry.minecraftVersion}: ${error.message}`);
      }
    }
  }
  const hasDeltaEvidence = ['rendererAssets', 'savedAnvil', 'referenceParity']
    .some((field) => entry[field]?.status === 'verified');
  if (hasDeltaEvidence) {
    for (const error of validateReleaseDeltaParityCoverage({
      version: entry.minecraftVersion,
      baselineVersion: baseline?.minecraftVersion ?? null,
      assetsReport: loadedReports.get('assets') ?? null,
      anvilReport: loadedReports.get('anvil') ?? null,
      parityReport: loadedReports.get('parity') ?? null,
      previousParityReport: baseline ? parityReportsByVersion.get(baseline.minecraftVersion) ?? null : null,
    })) errors.push(`release delta parity ${entry.minecraftVersion}: ${error}`);
  }
  if (entry.paperLive?.status !== 'unverified') {
    const record = entry.paperLive.report;
    const canonicalPrefix = `spec/map/evidence/version-deltas/${entry.minecraftVersion}/`;
    expect(typeof record?.path === 'string' && record.path.startsWith(canonicalPrefix) && !record.path.split('/').includes('..'), `paperLive evidence path escapes its exact-version evidence directory: ${entry.minecraftVersion}`);
    if (typeof record?.path === 'string' && record.path.startsWith(canonicalPrefix) && !record.path.split('/').includes('..')) {
      const bytes = await readFile(resolve(repoRoot, record.path)).catch(() => null);
      expect(Boolean(bytes), `paperLive report file is missing for ${entry.minecraftVersion}`);
      if (bytes) {
        expect(digestBytes(bytes) === record.sha256, `paperLive report digest mismatch for ${entry.minecraftVersion}`);
        try {
          const report = JSON.parse(bytes.toString('utf8'));
          for (const error of validateVersionDeltaReport(report, {
            kind: 'paper',
            version: entry.minecraftVersion,
            baselineVersion: baseline?.minecraftVersion ?? null,
            targetDigest: entry.paperLive.paperJarSha256 ?? entry.paperLive.officialAvailabilityEvidenceSha256,
            baselineDigest: baseline?.paperLive?.paperJarSha256 ?? null,
          })) errors.push(`paperLive report ${entry.minecraftVersion}: ${error}`);
        } catch (error) {
          if (error instanceof SyntaxError) errors.push(`paperLive report is invalid JSON for ${entry.minecraftVersion}`);
          else errors.push(`paperLive report ${entry.minecraftVersion}: ${error.message}`);
        }
      }
    }
  }
}
if (requireDynmapOracle) {
  const incomplete = versionDeltas.entries.filter((entry) => entry.dynmapOracle?.status !== 'verified');
  expect(incomplete.length === 0, `Dynmap exact-release oracle evidence is pending for ${incomplete.length} releases${incomplete.length ? ` (first: ${incomplete.slice(0, 5).map((entry) => entry.minecraftVersion).join(', ')})` : ''}`);
}

const officialSnapshot = versions.officialManifestSnapshot;
if (officialSnapshot) {
  const safeSnapshotFile = (name) => typeof name === 'string' && name.length > 0 && name === name.split(/[\\/]/).at(-1);
  expect(safeSnapshotFile(officialSnapshot.rawArchive), 'official manifest archive path must be a filename inside spec/map/coverage');
  expect(safeSnapshotFile(officialSnapshot.releaseSetFile), 'official release-set path must be a filename inside spec/map/coverage');
  if (safeSnapshotFile(officialSnapshot.rawArchive) && safeSnapshotFile(officialSnapshot.releaseSetFile)) {
    const coverageRoot = resolve(repoRoot, 'spec/map/coverage');
    const compressedManifest = await readFile(resolve(coverageRoot, officialSnapshot.rawArchive)).catch(() => null);
    const releaseSetBytes = await readFile(resolve(coverageRoot, officialSnapshot.releaseSetFile)).catch(() => null);
    expect(Boolean(compressedManifest), `pinned official version manifest archive is missing: ${officialSnapshot.rawArchive}`);
    expect(Boolean(releaseSetBytes), `pinned official release-set file is missing: ${officialSnapshot.releaseSetFile}`);
    if (compressedManifest && releaseSetBytes) {
      for (const error of verifyVersionSnapshot({ compressedManifest, releaseSetBytes, versionMatrix: versions })) {
        errors.push(`official version snapshot integrity: ${error}`);
      }
    }
  }
}

const upstreamRoot = resolve(repoRoot, 'src-tauri/crates/map-renderer-core/third_party/dynmap/upstream');
let sourceLines = 0;
const vendoredJavaPaths = [];
for (const entry of sourceCatalog.entries) {
  const source = resolve(upstreamRoot, entry.sourcePath);
  expect(await exists(source), `pinned source candidate missing: ${entry.sourcePath}`);
  if (await exists(source)) sourceLines += (await readFile(source, 'utf8')).split('\n').length - 1;
}
for (const sourcePath of await walk(upstreamRoot)) {
  if (extname(sourcePath) === '.java') vendoredJavaPaths.push(sourcePath.slice(upstreamRoot.length + 1));
}
const candidateJavaPaths = sourceCatalog.entries.map((entry) => entry.sourcePath).sort();
expect(JSON.stringify(candidateJavaPaths) === JSON.stringify(vendoredJavaPaths.sort()), 'source candidate catalog does not exactly cover the Java files in the current vendored snapshot');

const corePhases = (await readdir(resolve(planRoot, 'phases'))).filter((name) => /^phase-\d{3}-.+\.md$/.test(name));
const builtinPages = await walk(resolve(planRoot, 'phases/builtins'));
const versionPages = await walk(resolve(planRoot, 'phases/versions'));
expect(corePhases.length > 0, 'common phase set is empty');
expect(builtinPages.filter((path) => extname(path) === '.md').length === builtins.entries.length, 'built-in page count does not match built-in catalog');
expect(versionPages.filter((path) => extname(path) === '.md').length === versions.entries.length * stageNames.length, 'version-stage page count does not match exact release matrix');

const phaseNumber = (name) => /^phase-(\d{3})-/.exec(name)?.[1];
const toSlug = (value) => value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const expectedPhaseIds = [
  ...corePhases.map((name) => `P-${phaseNumber(name)}`),
  ...builtins.entries.map((entry) => `B-${entry.phaseId?.replace(/^B-/, '') ?? toSlug(entry.class)}`),
  ...versions.entries.flatMap((entry) => stageNames.map((stage) => `V-${entry.minecraftVersion}-${stage}`)),
];
for (const error of validatePhaseGraph(phaseGraph, { expectedNodeIds: expectedPhaseIds })) errors.push(`phase graph: ${error}`);

const indexedCoreRows = [...phaseIndexBody.matchAll(/^\| (P-\d{3}) \|.*?\[phase file\]\(([^)]+)\)/gm)];
const indexedCoreIds = indexedCoreRows.map((match) => match[1]);
expect(JSON.stringify([...indexedCoreIds].sort()) === JSON.stringify(expectedPhaseIds.filter((id) => id.startsWith('P-')).sort()), 'phase-index common IDs do not match phase files');
for (const match of indexedCoreRows) {
  const node = phaseGraph.nodes.find((candidate) => candidate.id === match[1]);
  expect(node?.document === match[2], `phase-index document path does not match phase graph for ${match[1]}`);
}

const generatedIndexBody = await readFile(resolve(planRoot, 'phases/generated-index.md'), 'utf8');
const generatedLinks = [...generatedIndexBody.matchAll(/\]\(([^)#]+\.md)\)/g)]
  .map((match) => match[1])
  .filter((path) => /^(?:phase-\d{3}-|builtins\/|versions\/)/.test(path));
const graphSpecialistPaths = phaseGraph.nodes
  .filter((node) => node.kind !== 'common')
  .map((node) => node.document.replace(/^phases\//, ''));
expect(JSON.stringify([...new Set(generatedLinks.filter((path) => /^(?:builtins\/|versions\/)/.test(path)))].sort()) === JSON.stringify(graphSpecialistPaths.sort()), 'generated specialist index links do not match built-in and exact-version phase graph nodes');
expect(generatedLinks.filter((path) => path.startsWith('phase-')).length === corePhases.length, 'generated specialist index does not link every common phase exactly once');

for (const node of phaseGraph.nodes) {
  const documentPath = resolve(planRoot, node.document);
  expect(documentPath.startsWith(`${planRoot}/`), `phase graph document path escapes the plan root: ${node.id}`);
  if (!documentPath.startsWith(`${planRoot}/`)) continue;
  const body = await readFile(documentPath, 'utf8').catch(() => null);
  expect(Boolean(body), `phase graph document is missing: ${node.id} -> ${node.document}`);
  if (!body) continue;
  for (const error of validatePhaseDocument(body, node)) errors.push(`phase document: ${error}`);
}

for (const entry of sourceMap.entries) {
  const owner = resolve(planRoot, entry.candidateOwnerDocument);
  expect(await exists(owner), `candidate owner page missing for ${entry.sourcePath}: ${entry.candidateOwnerDocument}`);
}
for (const entry of builtins.entries) {
  const page = resolve(planRoot, `phases/builtins/${entry.class.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}.md`);
  expect(await exists(page), `built-in phase missing: ${entry.class}`);
}
for (const entry of versions.entries) for (const stage of stageNames) {
  const page = resolve(planRoot, `phases/versions/${entry.minecraftVersion}/${stage}.md`);
  expect(await exists(page), `version stage missing: ${entry.minecraftVersion}/${stage}`);
}

const markdownRoots = [resolve(repoRoot, 'spec/map/plan'), resolve(repoRoot, 'spec/map/coverage'), resolve(repoRoot, 'spec/map/evidence')];
const markdownFiles = [];
for (const root of markdownRoots) markdownFiles.push(...(await walk(root)).filter((path) => extname(path) === '.md'));
markdownFiles.push(resolve(repoRoot, 'spec/ADR-000-index.md'));
for (const file of markdownFiles) {
  const body = await readFile(file, 'utf8');
  for (const match of body.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].split('#', 1)[0].trim();
    if (!target || /^(?:https?:|mailto:|data:)/i.test(target)) continue;
    const path = resolve(dirname(file), target);
    expect(await exists(path), `broken markdown link: ${file.replace(`${repoRoot}/`, '')} -> ${target}`);
  }
  expect(!/\b(?:TODO|TBD|TBC|FIXME)\b/i.test(body), `unresolved placeholder in ${file.replace(`${repoRoot}/`, '')}`);
}

const oldPlanPaths = [
  resolve(planRoot, 'phases/dynmap-reimplementation'),
  resolve(repoRoot, 'spec/dynmap'),
  resolve(repoRoot, 'spec/map/adr'),
  resolve(repoRoot, 'spec/map/versions'),
];
for (const path of oldPlanPaths) {
  if (await exists(path)) {
    const remaining = await walk(path);
    expect(remaining.length === 0, `legacy canonical plan path contains files: ${path.replace(`${repoRoot}/`, '')}`);
  }
}
const planPaths = await walk(planRoot);
expect(!planPaths.some((path) => /\/phase-r\d{2}-/.test(path)), 'legacy R00-R48 pages remain in canonical plan directory');

const obsoleteLinkPatterns = [/spec\/map\/adr\//, /dynmap-reimplementation/];
for (const file of markdownFiles) {
  const body = await readFile(file, 'utf8');
  for (const pattern of obsoleteLinkPatterns) expect(!pattern.test(body), `obsolete canonical link ${pattern} in ${file.replace(`${repoRoot}/`, '')}`);
}

const generatorCheck = await new Promise((resolvePromise) => {
  const child = spawn('bun', [resolve(planRoot, 'tools/generate-phase-files.mjs'), '--check'], { cwd: repoRoot, stdio: 'inherit' });
  child.on('exit', (code) => resolvePromise(code ?? 1));
});
expect(generatorCheck === 0, 'common/version phase documents do not match their generator');
const builtinGeneratorCheck = await new Promise((resolvePromise) => {
  const child = spawn('bun', [resolve(planRoot, 'tools/populate-builtin-plan-pages.mjs'), '--check'], { cwd: repoRoot, stdio: 'inherit' });
  child.on('exit', (code) => resolvePromise(code ?? 1));
});
expect(builtinGeneratorCheck === 0, 'built-in phase documents do not match their AST-derived generator');

if (requirePlanComplete || requireRendererComplete) {
  const planCoverage = await new Promise((resolvePromise) => {
    const child = spawn('bun', [
      resolve(planRoot, 'tools/validate-plan-coverage.mjs'),
    ], { cwd: repoRoot, stdio: 'inherit' });
    child.on('exit', (code) => resolvePromise(code ?? 1));
  });
  expect(planCoverage === 0, 'independent plan coverage gate did not pass');
}

if (requirePlanComplete || requireSemanticClosure || requireResourceClosure || requireRendererComplete) {
  const planCompletenessArgs = [resolve(planRoot, 'tools/plan-completeness.mjs')];
  if (requireSemanticClosure) planCompletenessArgs.push('--require-semantic-closure');
  if (requireResourceClosure) planCompletenessArgs.push('--require-resource-closure');
  const strictPlanClosure = await new Promise((resolvePromise) => {
    const child = spawn(process.execPath, planCompletenessArgs, { cwd: repoRoot, stdio: 'inherit' });
    child.on('exit', (code) => resolvePromise(code ?? 1));
  });
  expect(strictPlanClosure === 0, 'plan ownership or requested strict semantic-closure gate did not pass');
}

if (requireRendererComplete) {
  const strictCoverage = await new Promise((resolvePromise) => {
    const child = spawn('bun', [
      resolve(repoRoot, 'scripts/check-map-renderer-coverage.mjs'),
      '--require-complete',
    ], { cwd: repoRoot, stdio: 'inherit' });
    child.on('exit', (code) => resolvePromise(code ?? 1));
  });
  expect(strictCoverage === 0, 'renderer implementation/reference/acceptance gate did not pass');
}

if (errors.length) {
  console.error(`Map renderer plan validation failed (${errors.length}):\n- ${errors.join('\n- ')}`);
  process.exitCode = 1;
} else {
  if (requirePlanComplete) {
    console.log('Plan ownership passed: every inventoried source/resource item has a concrete phase and verification plan. Any still-open semantic closure remains explicitly counted and assigned; this does not imply renderer implementation or acceptance completion.');
  } else if (requireRendererComplete) {
    console.log('Renderer implementation/reference/acceptance completeness passed.');
  } else if (requireDynmapOracle) {
    console.log(`Dynmap per-release source/report bytes validated for all ${versionDeltas.entries.length} exact releases. This is not full Map renderer readiness.`);
  } else {
    console.log(`Candidate plan structure validated only: ${corePhases.length} common + ${builtins.entries.length} built-in candidates + ${versions.entries.length * stageNames.length} version stages; ${sourceMap.entries.length} source candidates, ${resources.entries.length} resource candidates, ${versions.entries.length} version candidates. This is not a completeness pass; use --require-plan-complete for the plan gate and --require-renderer-complete only after implementation.`);
  }
}
