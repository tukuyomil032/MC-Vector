#!/usr/bin/env node

import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { validateVersionDeltaReadiness } from '../spec/map/plan/tools/version-delta-matrix.mjs';

const root = resolve(import.meta.dirname, '..');
const revision = '93b454efb8802dc7406d6873434f2aeec5c636f4';
const supportedFlags = new Set([
  '--require-source-ast',
  '--require-closed-dependencies',
  '--require-all-symbols',
  '--require-resource-inventory',
  '--require-all-resources',
  '--require-all-resource-consumers',
  '--require-builtin-plan-owners',
  '--require-all-builtins',
  '--require-all-versions',
  '--require-version-deltas',
  '--require-dynmap-oracle',
  '--require-reference-evidence',
  '--require-complete',
  '--verbose',
]);
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(
    [
      'Usage: bun scripts/check-map-renderer-coverage.mjs [flags]',
      ...[...supportedFlags].map((flag) => `  ${flag}`),
    ].join('\n'),
  );
  process.exit(0);
}
const unknownFlags = args.filter((arg) => !supportedFlags.has(arg));
if (unknownFlags.length > 0) {
  console.error(`Unknown coverage flag(s): ${unknownFlags.join(', ')}`);
  console.error('Run with --help to see supported flags.');
  process.exit(2);
}
const verbose = args.includes('--verbose');
const strict = new Set(args.filter((arg) => arg !== '--verbose'));

const load = async (relativePath) =>
  JSON.parse(await readFile(resolve(root, relativePath), 'utf8'));
const loadOptional = async (relativePath) => {
  try {
    return await load(relativePath);
  } catch {
    return null;
  }
};
const loadGzipJson = async (relativePath) => {
  try {
    return JSON.parse(gunzipSync(await readFile(resolve(root, relativePath))).toString('utf8'));
  } catch {
    return null;
  }
};

const catalogs = {
  symbols: await load('spec/map/coverage/source-symbols.json'),
  resources: await load('spec/map/coverage/resources.json'),
  builtins: await load('spec/map/coverage/builtin-renderers.json'),
  versions: await load('spec/map/coverage/version-matrix.json'),
};
const versionDeltaMatrix = await loadOptional('spec/map/coverage/version-delta-matrix.json');
const astInventory = await loadGzipJson('spec/map/coverage/java-ast-inventory.json.gz');
const resourceInventory = await loadGzipJson('spec/map/coverage/pinned-resource-inventory.json.gz');
const symbolDispositions = await loadOptional('spec/map/coverage/source-symbol-dispositions.json');
const dependencyEdges = await loadOptional('spec/map/coverage/source-dependency-edges.json');

const failures = [];
const requires = (flag) => strict.has(flag) || strict.has('--require-complete');
for (const [name, catalog] of Object.entries(catalogs)) {
  if (name !== 'versions' && catalog.sourceRevision !== revision) {
    failures.push(`${name}: source revision mismatch`);
  }
  if (!Array.isArray(catalog.entries) || catalog.entries.length === 0) {
    failures.push(`${name}: catalog is empty`);
  }
  for (const entry of catalog.entries ?? []) {
    if (entry.status === 'planned')
      failures.push(`${name}: planned entry ${entry.sourcePath ?? entry.class}`);
    if (name !== 'versions' && !entry.sourceRevision)
      failures.push(`${name}: missing entry revision ${entry.sourcePath ?? entry.class}`);
  }
}

if (requires('--require-source-ast')) {
  if (!astInventory) {
    failures.push('symbols: pinned Java AST inventory is missing or corrupt');
  } else {
    const { counts } = astInventory;
    if (
      astInventory.sourceRevision !== revision ||
      !/^[0-9a-f]{40}$/.test(astInventory.sourceTreeSha1 ?? '')
    ) {
      failures.push('symbols: AST inventory is not bound to a pinned Git commit/tree');
    }
    if (astInventory.sourceRevisionProvenance !== 'verified_against_git_commit_and_java_blob_ids') {
      failures.push('symbols: AST inventory source provenance has not been Git-verified');
    }
    if (
      astInventory.parseMode !== 'syntax_only_no_symbol_resolution' ||
      astInventory.semanticDependencyClosureComplete !== false
    ) {
      failures.push(
        'symbols: AST inventory must report syntax-only parsing and open semantic closure',
      );
    }
    if (
      !counts ||
      counts.sourceFiles !== astInventory.sourceFiles?.length ||
      counts.declarations !== astInventory.declarations?.length ||
      counts.referenceCandidates !== astInventory.referenceCandidates?.length ||
      counts.parseErrors !== 0 ||
      counts.duplicateSymbolIds !== 0
    ) {
      failures.push(
        'symbols: AST inventory counts do not match its arrays or contain parse/identity failures',
      );
    }
    const sourcePaths = new Set(astInventory.sourceFiles?.map((entry) => entry.sourcePath));
    const declarationIds = astInventory.declarations?.map((entry) => entry.symbolId) ?? [];
    if (
      sourcePaths.size !== astInventory.sourceFiles?.length ||
      new Set(declarationIds).size !== declarationIds.length ||
      astInventory.declarations?.some((entry) => !sourcePaths.has(entry.sourcePath))
    ) {
      failures.push(
        'symbols: AST inventory has duplicate paths/IDs or declarations outside the pinned Java files',
      );
    }
    if (
      astInventory.sourceFiles?.some(
        (entry) =>
          !/^[0-9a-f]{40}$/.test(entry.gitBlobSha1 ?? '') ||
          !/^[0-9a-f]{64}$/.test(entry.contentSha256 ?? ''),
      )
    ) {
      failures.push('symbols: AST inventory has missing or malformed per-file content identities');
    }
  }
}
if (requires('--require-closed-dependencies')) {
  if (
    dependencyEdges?.status !== 'closed' ||
    !Array.isArray(dependencyEdges.edges) ||
    dependencyEdges.edges.some(
      (edge) => edge.status !== 'resolved' && edge.status !== 'justified_exclusion',
    ) ||
    (dependencyEdges.unresolved?.length ?? 0) !== 0
  ) {
    failures.push(
      'symbols: resolved dependency-edge ledger is missing, open, or contains unresolved edges',
    );
  }
}

if (requires('--require-resource-inventory')) {
  if (!resourceInventory) {
    failures.push('resources: pinned resource path inventory is missing or corrupt');
  } else {
    const entries = resourceInventory.entries;
    const paths = entries?.map((entry) => entry.sourcePath) ?? [];
    if (
      resourceInventory.sourceRevision !== revision ||
      resourceInventory.sourceRevisionProvenance !==
        'verified_against_git_commit_and_resource_blob_ids' ||
      !/^[0-9a-f]{40}$/.test(resourceInventory.sourceTreeSha1 ?? '') ||
      resourceInventory.sourceTreeSha1 !== astInventory?.sourceTreeSha1
    ) {
      failures.push(
        'resources: inventory is not bound to the same pinned Git tree as the Java AST inventory',
      );
    }
    if (
      !resourceInventory.counts ||
      resourceInventory.counts.resources !== entries?.length ||
      new Set(paths).size !== paths.length ||
      entries?.some(
        (entry) =>
          !/^[0-9a-f]{40}$/.test(entry.gitBlobSha1 ?? '') ||
          !/^[0-9a-f]{64}$/.test(entry.contentSha256 ?? '') ||
          !Number.isSafeInteger(entry.byteLength) ||
          entry.byteLength < 0 ||
          typeof entry.resourceRoot !== 'string' ||
          typeof entry.relativePath !== 'string' ||
          !entry.relativePath ||
          entry.sourcePath !== `${entry.resourceRoot}${entry.relativePath}`,
      )
    ) {
      failures.push(
        'resources: inventory contains duplicate paths, invalid hashes, or inconsistent byte/path metadata',
      );
    }
    if (
      resourceInventory.consumerClosureComplete !== false ||
      resourceInventory.classificationComplete !== false
    ) {
      failures.push(
        'resources: path inventory must not claim unverified consumer/classification closure',
      );
    }
  }
}

if (requires('--require-all-symbols')) {
  const rows = symbolDispositions?.entries;
  const expectedIds = new Set(astInventory?.declarations?.map((entry) => entry.symbolId) ?? []);
  if (!Array.isArray(rows)) {
    failures.push(
      `symbols: declaration disposition ledger is missing for ${expectedIds.size} AST declarations`,
    );
  } else {
    const rowIds = rows.map((entry) => entry.symbolId);
    if (
      new Set(rowIds).size !== rowIds.length ||
      rowIds.length !== expectedIds.size ||
      rowIds.some((id) => !expectedIds.has(id))
    ) {
      failures.push(
        'symbols: declaration disposition IDs do not exactly match the pinned AST inventory',
      );
    }
    const incomplete = rows.filter((entry) => {
      if (
        !['required', 'boundary_adapter', 'excluded'].includes(entry.classification) ||
        !entry.rationale ||
        !entry.sourcePath ||
        !entry.signature
      )
        return true;
      if (entry.classification === 'excluded')
        return (
          !Array.isArray(entry.exclusionEvidenceIds) || entry.exclusionEvidenceIds.length === 0
        );
      return (
        !entry.rustDestination ||
        !entry.ownerPhaseId ||
        !Array.isArray(entry.fixtureIds) ||
        entry.fixtureIds.length === 0 ||
        !Array.isArray(entry.referenceCaptureIds) ||
        entry.referenceCaptureIds.length === 0 ||
        !Array.isArray(entry.focusedTestIds) ||
        entry.focusedTestIds.length === 0 ||
        !Array.isArray(entry.evidenceIds) ||
        entry.evidenceIds.length === 0
      );
    });
    if (incomplete.length)
      failures.push(
        `symbols: ${incomplete.length} declaration rows lack classification, owner, or proof links`,
      );
    if (rows.some((entry) => entry.implementationStatus !== 'verified')) {
      failures.push(
        'symbols: one or more classified declarations lack verified implementation evidence',
      );
    }
  }
}
if (requires('--require-all-resources')) {
  const inventoryPaths = new Set(
    resourceInventory?.entries?.map((entry) => entry.sourcePath) ?? [],
  );
  const catalogPaths = new Set(catalogs.resources.entries.map((entry) => entry.sourcePath));
  const missing = [...inventoryPaths].filter((path) => !catalogPaths.has(path));
  const extra = [...catalogPaths].filter((path) => !inventoryPaths.has(path));
  if (!resourceInventory || missing.length || extra.length) {
    failures.push(
      `resources: disposition catalog does not exactly match pinned inventory (missing ${missing.length}, extra ${extra.length})`,
    );
  }
  for (const entry of catalogs.resources.entries) {
    if (
      !['required-renderer', 'adapter-input', 'excluded-platform'].includes(entry.scope) ||
      !/^[0-9a-f]{40}$/.test(entry.gitBlobSha1 ?? '') ||
      !/^[0-9a-f]{64}$/.test(entry.contentSha256 ?? '') ||
      !entry.ownerPhaseId ||
      !entry.phaseDocument
    ) {
      failures.push(`resources: incomplete scope/hash/phase owner ${entry.sourcePath}`);
    }
    if (entry.scope !== 'excluded-platform' && entry.implementationStatus !== 'verified') {
      failures.push(`resources: incomplete implementation ${entry.sourcePath}`);
    }
  }
}
if (requires('--require-all-resource-consumers')) {
  const inventoryPaths = new Set(
    resourceInventory?.entries?.map((entry) => entry.sourcePath) ?? [],
  );
  const catalogPaths = new Set(catalogs.resources.entries.map((entry) => entry.sourcePath));
  const missingFromCatalog = [...inventoryPaths].filter((path) => !catalogPaths.has(path));
  const outsideInventory = [...catalogPaths].filter((path) => !inventoryPaths.has(path));
  if (!resourceInventory || missingFromCatalog.length || outsideInventory.length) {
    failures.push(
      `resources: consumer ledger does not equal the pinned inventory (missing ${missingFromCatalog.length}, extra ${outsideInventory.length})`,
    );
  }
  const missingConsumers = catalogs.resources.entries.filter((entry) => {
    if (entry.scope === 'excluded-platform')
      return !entry.exclusionRationale || !entry.ownerPhaseId;
    return (
      !Array.isArray(entry.consumerSymbolIds) ||
      entry.consumerSymbolIds.length === 0 ||
      !entry.ownerPhaseId ||
      !Array.isArray(entry.fixtureIds) ||
      entry.fixtureIds.length === 0
    );
  });
  if (missingConsumers.length > 0) {
    failures.push(
      `resources: ${missingConsumers.length} entries lack consumer symbol IDs or a concrete exclusion rationale (first: ${missingConsumers
        .slice(0, 5)
        .map((entry) => entry.sourcePath)
        .join(', ')})`,
    );
  }
}
if (requires('--require-builtin-plan-owners')) {
  const missingOwners = [];
  const seenPhaseIds = new Set();
  for (const entry of catalogs.builtins.entries) {
    const slug = entry.class.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
    const expectedPhaseId = `B-${slug}`;
    const expectedDocument = `phases/builtins/${slug}.md`;
    if (!entry.phaseId || entry.phaseId !== expectedPhaseId) {
      missingOwners.push(`${entry.class} (phaseId ${entry.phaseId ?? 'missing'})`);
      continue;
    }
    if (seenPhaseIds.has(entry.phaseId)) {
      missingOwners.push(`${entry.class} (duplicate phaseId ${entry.phaseId})`);
      continue;
    }
    seenPhaseIds.add(entry.phaseId);
    if (entry.phaseDocument !== expectedDocument) {
      missingOwners.push(`${entry.class} (phaseDocument ${entry.phaseDocument ?? 'missing'})`);
      continue;
    }
    try {
      await access(resolve(root, 'spec/map/plan', entry.phaseDocument));
      const page = await readFile(resolve(root, 'spec/map/plan', entry.phaseDocument), 'utf8');
      if (!page.startsWith(`# ${expectedPhaseId}:`)) {
        missingOwners.push(`${entry.class} (phase document ID does not match catalog)`);
      }
    } catch {
      missingOwners.push(`${entry.class} (phase document does not exist)`);
    }
  }
  if (missingOwners.length > 0) {
    failures.push(
      `builtins: ${missingOwners.length} entries lack a valid one-to-one phase owner (first: ${missingOwners.slice(0, 5).join(', ')})`,
    );
  }
}
if (requires('--require-all-builtins')) {
  for (const entry of catalogs.builtins.entries) {
    if (entry.implementationStatus !== 'verified') {
      failures.push(`builtins: incomplete implementation ${entry.class}`);
    }
  }
}
if (requires('--require-all-versions')) {
  for (const entry of catalogs.versions.entries) {
    if (entry.artifactStatus !== 'verified' || entry.status !== 'verified') {
      failures.push(`versions: incomplete implementation ${entry.minecraftVersion}`);
    }
  }
}
if (requires('--require-version-deltas')) {
  if (!versionDeltaMatrix) {
    failures.push('versions: exact-release delta matrix is missing or invalid');
  } else {
    const deltaErrors = validateVersionDeltaReadiness(versionDeltaMatrix, catalogs.versions);
    if (deltaErrors.length > 0) {
      failures.push(
        `versions: ${deltaErrors.length} exact-release delta evidence gaps; first: ${deltaErrors.slice(0, 5).join('; ')}`,
      );
    }
  }
}
if (requires('--require-dynmap-oracle')) {
  if (!versionDeltaMatrix) {
    failures.push('versions: Dynmap exact-release oracle matrix is missing or invalid');
  } else {
    const missingDynmapOracle = versionDeltaMatrix.entries.filter((entry) => {
      const source = entry.dynmapOracle?.sourceSelection;
      return (
        entry.dynmapOracle?.status !== 'verified' ||
        !/^[a-f0-9]{64}$/.test(entry.dynmapOracle?.sha256 ?? '') ||
        !/^[a-f0-9]{40}$/.test(source?.selectedRevision ?? '') ||
        !/^[a-f0-9]{64}$/.test(source?.selectedSourceTreeSha256 ?? '') ||
        !/^[a-f0-9]{64}$/.test(source?.referenceBuildSha256 ?? '') ||
        !/^[a-f0-9]{64}$/.test(source?.sourceDeltaManifestSha256 ?? '') ||
        !/^[a-f0-9]{64}$/.test(source?.baselineSourceTreeSha256 ?? '')
      );
    });
    if (missingDynmapOracle.length > 0) {
      failures.push(
        `versions: ${missingDynmapOracle.length} exact releases lack a verified Dynmap oracle and source-delta selection (first: ${missingDynmapOracle
          .slice(0, 5)
          .map((entry) => entry.minecraftVersion)
          .join(', ')})`,
      );
    }
  }
}
if (requires('--require-reference-evidence')) {
  const missingSymbolReferences = (symbolDispositions?.entries ?? [])
    .filter((symbol) => symbol.classification !== 'excluded')
    .filter(
      (symbol) =>
        !Array.isArray(symbol.referenceCaptureIds) || symbol.referenceCaptureIds.length === 0,
    )
    .map((symbol) => `${symbol.sourcePath}#${symbol.symbolId}`);
  if (!symbolDispositions)
    failures.push(
      'symbols: reference evidence cannot be checked without declaration disposition ledger',
    );
  const missingBuiltinReferences = catalogs.builtins.entries.filter(
    (entry) => !entry.referenceTrace || !entry.pixelGolden,
  );
  const missingVersionReferences = catalogs.versions.entries.filter(
    (entry) => !entry.referenceCapture,
  );
  if (missingSymbolReferences.length > 0) {
    failures.push(
      `symbols: ${missingSymbolReferences.length} required declarations lack referenceTraceIds (first: ${missingSymbolReferences.slice(0, 5).join(', ')})`,
    );
  }
  if (missingBuiltinReferences.length > 0) {
    failures.push(
      `builtins: ${missingBuiltinReferences.length} entries lack a Java reference trace or fixed pixel golden (first: ${missingBuiltinReferences
        .slice(0, 5)
        .map((entry) => entry.class)
        .join(', ')})`,
    );
  }
  if (missingVersionReferences.length > 0) {
    failures.push(
      `versions: ${missingVersionReferences.length} exact releases lack a reference capture (first: ${missingVersionReferences
        .slice(0, 5)
        .map((entry) => entry.minecraftVersion)
        .join(', ')})`,
    );
  }
}

if (failures.length > 0) {
  if (verbose) {
    console.error(failures.join('\n'));
  } else {
    const groups = new Map();
    for (const failure of failures) {
      const category = failure.split(':', 1)[0];
      const group = groups.get(category) ?? [];
      group.push(failure);
      groups.set(category, group);
    }
    console.error(
      `Map renderer coverage failed (${failures.length} findings). Summary by catalog:`,
    );
    for (const [category, entries] of groups) {
      console.error(`- ${category}: ${entries.length}`);
      for (const sample of entries.slice(0, 2)) console.error(`  - ${sample}`);
    }
    console.error('Use --verbose to print every finding.');
  }
  process.exitCode = 1;
} else if (strict.size === 0) {
  console.log(
    `Candidate catalogs loaded: ${catalogs.symbols.entries.length} source-file candidates, ` +
      `${catalogs.resources.entries.length} resource candidates, ${catalogs.builtins.entries.length} built-in candidates. ` +
      'This is not a renderer-readiness or completeness pass; use --require-complete for strict gates.',
  );
} else {
  console.log(`Requested Map renderer coverage checks passed: ${[...strict].join(', ')}`);
}
