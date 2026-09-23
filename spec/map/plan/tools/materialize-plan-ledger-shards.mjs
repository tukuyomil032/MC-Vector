import { readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const coverageRoot = resolve(repositoryRoot, 'spec/map/coverage');
const planCoverageRoot = resolve(repositoryRoot, 'spec/map/plan/coverage');
const sourceShardRoot = resolve(planCoverageRoot, 'source-disposition-shards');
const resourceShardRoot = resolve(planCoverageRoot, 'resource-consumer-shards');
const resourceCShardRoot = resolve(planCoverageRoot, 'resource-c-shards');
const PINNED_REVISION = '93b454efb8802dc7406d6873434f2aeec5c636f4';
const RESOURCE_SCOPES = new Set(['renderer-runtime', 'reference-only', 'boundary-adapter', 'excluded']);
const SOURCE_CLASSIFICATIONS = new Set(['required', 'boundary_adapter', 'excluded']);

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function readGzipJson(path) {
  return JSON.parse(gunzipSync(await readFile(path)).toString('utf8'));
}

async function readShardDirectory(directory) {
  const names = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort();
  return Promise.all(names.map(async (name) => ({ path: join(directory, name), value: await readJson(join(directory, name)) })));
}

function requiredString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function validateUniqueRows(rows, key, label) {
  const ids = rows.map((row) => row?.[key]);
  const unique = new Set(ids);
  if (ids.some((id) => !requiredString(id)) || unique.size !== ids.length) {
    throw new Error(`${label} contains missing or duplicate ${key}`);
  }
}

function validateSourceRow(row, declaration, sourceFile, label) {
  for (const field of ['symbolId', 'sourcePath', 'signature', 'classification', 'rationale']) {
    if (!requiredString(row[field])) throw new Error(`${label} lacks ${field} for ${declaration.symbolId}`);
  }
  if (row.symbolId !== declaration.symbolId || row.sourcePath !== declaration.sourcePath
      || row.signature !== declaration.signature
      || row.sourceGitBlobSha1 !== sourceFile?.gitBlobSha1
      || row.sourceContentSha256 !== sourceFile?.contentSha256
      || row.sourceSpan?.startLine !== declaration.startLine
      || row.sourceSpan?.endLine !== declaration.endLine) {
    throw new Error(`${label} does not match pinned AST identity for ${declaration.symbolId}`);
  }
  if (!SOURCE_CLASSIFICATIONS.has(row.classification) || !Array.isArray(row.dependencyEdgeIds)) {
    throw new Error(`${label} has invalid classification or dependencyEdgeIds for ${declaration.symbolId}`);
  }
  if (row.classification === 'excluded') {
    if (!Array.isArray(row.exclusionEvidenceIds) || row.exclusionEvidenceIds.length === 0) {
      throw new Error(`${label} lacks exclusion evidence for ${declaration.symbolId}`);
    }
    return;
  }
  for (const field of ['rustDestination', 'ownerPhaseId', 'ownerPhaseDocument']) {
    if (!requiredString(row[field])) throw new Error(`${label} lacks ${field} for ${declaration.symbolId}`);
  }
  for (const field of ['fixturePlanIds', 'referencePlanIds', 'focusedTestPlanIds', 'evidencePlanIds']) {
    if (!Array.isArray(row[field]) || row[field].length === 0 || row[field].some((id) => !requiredString(id))) {
      throw new Error(`${label} lacks ${field} for ${declaration.symbolId}`);
    }
  }
}

export function buildSourceLedger({ ast, existing, shards, edges }) {
  if (ast.sourceRevision !== PINNED_REVISION || !Array.isArray(ast.declarations) || !Array.isArray(ast.sourceFiles)) {
    throw new Error('Pinned AST inventory is missing or has the wrong revision');
  }
  if (edges.sourceRevision !== PINNED_REVISION || !['open', 'closed'].includes(edges.status)
      || !Array.isArray(edges.edges) || !Array.isArray(edges.unresolved)) {
    throw new Error('The canonical dependency edge ledger is missing or has an invalid state');
  }
  const unresolvedReferences = edges.unresolved.reduce((total, item) => total + (item.candidateCount ?? 0), 0);
  const dispositionedReferences = edges.resolvedReferenceCandidateCount
    + edges.boundaryReferenceCandidateCount + edges.excludedReferenceCandidateCount + unresolvedReferences;
  if (edges.referenceCandidateCount !== ast.counts?.referenceCandidates
      || edges.unresolvedReferenceCandidateCount !== unresolvedReferences
      || dispositionedReferences !== ast.counts?.referenceCandidates) {
    throw new Error('Dependency edge states do not account for the exact AST reference-candidate count');
  }
  if ((unresolvedReferences === 0) !== (edges.status === 'closed')) {
    throw new Error('Dependency edge status does not match its unresolved candidate count');
  }
  for (const item of edges.unresolved) {
    if (!Number.isInteger(item.candidateCount) || item.candidateCount <= 0
        || !requiredString(item.phaseId) || !requiredString(item.phaseDocument)
        || !requiredString(item.reason) || !item.candidateInventoryPointers
        || Object.keys(item.candidateInventoryPointers).length === 0) {
      throw new Error('Open dependency candidates lack an exact planned owner, reason, or inventory pointer');
    }
  }
  validateUniqueRows(ast.declarations, 'symbolId', 'AST inventory');
  validateUniqueRows(ast.sourceFiles, 'sourcePath', 'AST source file inventory');
  validateUniqueRows(edges.edges, 'edgeId', 'Dependency ledger');

  validateUniqueRows(existing.entries ?? [], 'symbolId', 'Existing source dispositions');
  const rowsById = new Map((existing.entries ?? []).map((entry) => [entry.symbolId, entry]));
  const assignedShardIds = new Set();
  for (const shard of shards) {
    if (shard.value.sourceRevision !== PINNED_REVISION || !Array.isArray(shard.value.entries)) {
      throw new Error(`Invalid source disposition shard: ${shard.path}`);
    }
    for (const entry of shard.value.entries) {
      if (assignedShardIds.has(entry.symbolId)) {
        throw new Error(`Duplicate source disposition shard assignment: ${entry.symbolId}`);
      }
      assignedShardIds.add(entry.symbolId);
      rowsById.set(entry.symbolId, entry);
    }
  }
  const rows = [...rowsById.values()];
  validateUniqueRows(rows, 'symbolId', 'Merged source dispositions');
  const declarationById = new Map(ast.declarations.map((entry) => [entry.symbolId, entry]));
  const sourceFileByPath = new Map(ast.sourceFiles.map((entry) => [entry.sourcePath, entry]));
  const referenceCandidatesByContext = new Map();
  for (const [candidateIndex, candidate] of (ast.referenceCandidates ?? []).entries()) {
    if (!requiredString(candidate.contextSymbolId)) continue;
    const indexes = referenceCandidatesByContext.get(candidate.contextSymbolId) ?? [];
    indexes.push(candidateIndex);
    referenceCandidatesByContext.set(candidate.contextSymbolId, indexes);
  }
  const edgesBySource = new Map();
  const nonDeclarationEdgesBySource = new Map();
  for (const edge of edges.edges) {
    if (!requiredString(edge.sourceSymbolId)) throw new Error(`Dependency edge ${edge.edgeId} lacks sourceSymbolId`);
    if (!declarationById.has(edge.sourceSymbolId)) {
      const candidateIndexes = referenceCandidatesByContext.get(edge.sourceSymbolId);
      if (!candidateIndexes?.length) {
        throw new Error(`Dependency edge ${edge.edgeId} has no AST declaration or exact reference-context owner`);
      }
      const prefix = edge.sourceSymbolId.split(':', 1)[0];
      const ownerKind = prefix === 'import' ? 'import-context'
        : prefix === 'initializer' ? 'initializer-context'
          : 'ast-reference-context';
      const owner = nonDeclarationEdgesBySource.get(edge.sourceSymbolId) ?? { edgeIds: [], candidateIndexes, ownerKind };
      owner.edgeIds.push(edge.edgeId);
      nonDeclarationEdgesBySource.set(edge.sourceSymbolId, owner);
      continue;
    }
    const list = edgesBySource.get(edge.sourceSymbolId) ?? [];
    list.push(edge.edgeId);
    edgesBySource.set(edge.sourceSymbolId, list);
  }
  for (const row of rows) {
    const declaration = declarationById.get(row.symbolId);
    if (!declaration) throw new Error(`Disposition row refers to unknown AST symbol ${row.symbolId}`);
    validateSourceRow(row, declaration, sourceFileByPath.get(declaration.sourcePath), 'Source disposition');
  }
  if (rows.length !== ast.declarations.length) {
    throw new Error(`Source disposition coverage is incomplete: ${rows.length}/${ast.declarations.length}`);
  }

  const entries = rows.map((row) => ({
    ...row,
    dependencyEdgeIds: (edgesBySource.get(row.symbolId) ?? []).sort(),
    dependencyEdgeCoverage: unresolvedReferences === 0
      ? 'closed-pinned-reference-ledger'
      : 'known-edges-attached; remaining-candidates-owned-by-p000',
  })).sort((a, b) => a.symbolId.localeCompare(b.symbolId));
  const byClass = Object.fromEntries([...SOURCE_CLASSIFICATIONS].map((classification) => [
    classification,
    entries.filter((entry) => entry.classification === classification).length,
  ]));
  return {
    ...existing,
    status: unresolvedReferences === 0
      ? 'closed_pinned_symbol_and_dependency_coverage'
      : 'complete_symbol_disposition_with_open_dependency_closure',
    nonDeclarationEdgeOwners: [...nonDeclarationEdgesBySource.entries()].map(([sourceSymbolId, owner]) => ({
      sourceSymbolId,
      ownerKind: owner.ownerKind,
      dependencyEdgeIds: owner.edgeIds.sort(),
      candidateInventoryPointers: owner.candidateIndexes.map((candidateIndex) => `spec/map/coverage/java-ast-inventory.json.gz#/referenceCandidates/${candidateIndex}`),
    })).sort((a, b) => a.sourceSymbolId.localeCompare(b.sourceSymbolId)),
    counts: {
      expectedDeclarations: ast.declarations.length,
      dispositionedDeclarations: entries.length,
      undispositionedDeclarations: 0,
      ...byClass,
      dependencyEdges: edges.edges.length,
      nonDeclarationDependencyEdges: [...nonDeclarationEdgesBySource.values()].reduce((count, owner) => count + owner.edgeIds.length, 0),
      unresolvedDependencyReferenceCandidates: unresolvedReferences,
    },
    entries,
  };
}

function validateResourceRow(row, inventoryEntry, label) {
  for (const field of ['sourcePath', 'ownerPhaseId', 'phaseDocument']) {
    if (!requiredString(row[field])) throw new Error(`${label} lacks ${field} for ${inventoryEntry.sourcePath}`);
  }
  if (row.gitBlobSha1 !== inventoryEntry.gitBlobSha1 || row.contentSha256 !== inventoryEntry.contentSha256
      || row.byteLength !== inventoryEntry.byteLength || row.sourceRevision !== PINNED_REVISION) {
    throw new Error(`${label} does not match pinned resource identity for ${inventoryEntry.sourcePath}`);
  }
  if (row.scope === 'unclassified') {
    if (row.resolutionStatus !== 'open' || !requiredString(row.unresolvedReason)
        || !requiredString(row.resolutionWorkId)
        || !Array.isArray(row.fixturePlanIds) || row.fixturePlanIds.length === 0
        || !Array.isArray(row.referencePlanIds) || row.referencePlanIds.length === 0
        || !Array.isArray(row.focusedTestPlanIds) || row.focusedTestPlanIds.length === 0) {
      throw new Error(`${label} lacks an explicit unresolved classification plan for ${inventoryEntry.sourcePath}`);
    }
  } else if (!RESOURCE_SCOPES.has(row.scope)) {
    throw new Error(`${label} has invalid scope for ${inventoryEntry.sourcePath}`);
  } else if (row.scope === 'excluded') {
    if (!requiredString(row.exclusionRationale) || !Array.isArray(row.exclusionEvidenceIds)
        || row.exclusionEvidenceIds.length === 0) {
      throw new Error(`${label} lacks exclusion evidence for ${inventoryEntry.sourcePath}`);
    }
  } else {
    for (const field of ['consumerSymbolIds', 'fixturePlanIds', 'referencePlanIds', 'focusedTestPlanIds']) {
      if (!Array.isArray(row[field]) || row[field].length === 0 || row[field].some((id) => !requiredString(id))) {
        throw new Error(`${label} lacks ${field} for ${inventoryEntry.sourcePath}`);
      }
    }
  }
}

export function buildResourceCatalog({ inventory, existing, shards, supplementalShards = [] }) {
  if (inventory.sourceRevision !== PINNED_REVISION || !Array.isArray(inventory.entries)) {
    throw new Error('Pinned resource inventory is missing or has the wrong revision');
  }
  validateUniqueRows(inventory.entries, 'sourcePath', 'Pinned resource inventory');
  validateUniqueRows(existing.entries ?? [], 'sourcePath', 'Existing resource catalog');
  const rowsByPath = new Map((existing.entries ?? []).map((entry) => [entry.sourcePath, entry]));
  const assignedShardPaths = new Set();
  const assignShardRows = (entries, label) => {
    for (const entry of entries) {
      if (assignedShardPaths.has(entry.sourcePath)) throw new Error(`${label} repeats assigned path ${entry.sourcePath}`);
      assignedShardPaths.add(entry.sourcePath);
      rowsByPath.set(entry.sourcePath, entry);
    }
  };
  let unresolvedBasePaths = null;
  for (const shard of shards) {
    if (shard.value.sourceRevision !== PINNED_REVISION || !Array.isArray(shard.value.entries)) {
      throw new Error(`Invalid resource consumer shard: ${shard.path}`);
    }
    assignShardRows(shard.value.entries, 'Resource consumer shards');
    if (Array.isArray(shard.value.unresolvedEntries)) {
      if (unresolvedBasePaths !== null) throw new Error('More than one primary resource shard carries unresolved candidate rows');
      unresolvedBasePaths = shard.value.unresolvedEntries;
    }
  }
  const unresolvedCandidates = [];
  for (const shard of supplementalShards) {
    if (shard.value.sourceRevision !== PINNED_REVISION || !Array.isArray(shard.value.entries)) {
      throw new Error(`Invalid supplemental resource shard: ${shard.path}`);
    }
    assignShardRows(shard.value.entries, 'Supplemental resource shards');
    if (Array.isArray(shard.value.unresolvedEntries)) unresolvedCandidates.push(...shard.value.unresolvedEntries);
  }
  if (supplementalShards.length > 0 && unresolvedBasePaths === null) {
    throw new Error('Primary resource consumer shards lack the unresolved candidate inventory');
  }
  const primaryUnresolvedRows = unresolvedBasePaths ?? [];
  const unresolvedPathSet = new Set(primaryUnresolvedRows.map((entry) => entry.sourcePath));
  const supplementalPathRows = supplementalShards.flatMap((shard) => [
    ...shard.value.entries,
    ...(shard.value.unresolvedEntries ?? []),
  ]);
  const supplementalPathSet = new Set(supplementalPathRows.map((entry) => entry.sourcePath));
  if (unresolvedPathSet.size !== primaryUnresolvedRows.length
      || supplementalPathSet.size !== supplementalPathRows.length
      || unresolvedPathSet.size !== supplementalPathSet.size
      || [...unresolvedPathSet].some((path) => !supplementalPathSet.has(path))) {
    throw new Error('Supplemental resource shards do not exactly resolve the primary shard candidate path set');
  }
  for (const candidate of unresolvedCandidates) {
    const digest = createHash('sha256').update(candidate.sourcePath).digest('hex');
    const planKey = `P001-UNRESOLVED-RESOURCE-${digest.slice(0, 20)}`;
    assignShardRows([{
      ...candidate,
      scope: 'unclassified',
      scopeStatus: 'pending_source_and_consumer_review',
      consumerSymbolIds: [],
      fixturePlanIds: [`FIX-${planKey}`],
      referencePlanIds: [`REF-${planKey}`],
      focusedTestPlanIds: [`TEST-${planKey}`],
      evidencePlanIds: [`EVID-${planKey}`],
      exclusionRationale: null,
      exclusionEvidenceIds: [],
      resolutionStatus: 'open',
      resolutionWorkId: planKey,
      unresolvedReason: 'The current source pass does not prove whether this exact packaged path affects renderer output, belongs only to a platform boundary, or is non-renderer packaging. P-001 must trace its exact consumer and classify it without inferring from the path name.',
      status: 'unclassified_with_explicit_phase_owner',
      implementationStatus: 'not_started',
    }], 'Unresolved resource candidates');
  }
  const rows = [...rowsByPath.values()];
  validateUniqueRows(rows, 'sourcePath', 'Merged resource catalog');
  const inventoryByPath = new Map(inventory.entries.map((entry) => [entry.sourcePath, entry]));
  for (const row of rows) {
    const inventoryEntry = inventoryByPath.get(row.sourcePath);
    if (!inventoryEntry) throw new Error(`Resource catalog contains non-pinned path ${row.sourcePath}`);
    validateResourceRow(row, inventoryEntry, 'Resource catalog row');
  }
  if (rows.length !== inventory.entries.length) {
    throw new Error(`Resource catalog coverage is incomplete: ${rows.length}/${inventory.entries.length}`);
  }
  const counts = Object.fromEntries([...RESOURCE_SCOPES].map((scope) => [
    scope,
    rows.filter((entry) => entry.scope === scope).length,
  ]));
  const unclassified = rows.filter((entry) => entry.scope === 'unclassified').length;
  const consumerClosureComplete = rows.every((entry) => entry.scopeStatus === 'verified'
    || entry.status === 'verified' || entry.implementationStatus === 'complete');
  return {
    ...existing,
    status: consumerClosureComplete ? 'closed_pinned_resource_consumer_coverage' : 'planned_dispositions_consumer_closure_open',
    classificationComplete: unclassified === 0,
    consumerClosureComplete,
    counts: {
      ...counts,
      total: rows.length,
      unclassified,
      licenseUnverified: rows.filter((entry) => entry.licenseStatus !== 'verified').length,
    },
    entries: inventory.entries.map((entry) => rows.find((row) => row.sourcePath === entry.sourcePath)),
  };
}

async function atomicWrite(path, value, compressed = false) {
  const temporaryPath = `${path}.part`;
  const bytes = compressed ? gzipSync(Buffer.from(stableJson(value))) : stableJson(value);
  await writeFile(temporaryPath, bytes, { flag: 'wx' }).catch(async (error) => {
    if (error.code !== 'EEXIST') throw error;
    throw new Error(`Refusing to overwrite an existing staging file: ${temporaryPath}`);
  });
  await rename(temporaryPath, path);
}

export async function materializePlanLedgerShards(mode = 'check') {
  const [ast, sourceExisting, edges, resourceInventory, resourceExisting, sourceShards, resourceShards, resourceCShards] = await Promise.all([
    readGzipJson(resolve(coverageRoot, 'java-ast-inventory.json.gz')),
    readJson(resolve(coverageRoot, 'source-symbol-dispositions.json')),
    readJson(resolve(coverageRoot, 'source-dependency-edges.json')),
    readGzipJson(resolve(coverageRoot, 'pinned-resource-inventory.json.gz')),
    readJson(resolve(coverageRoot, 'resources.json')),
    readShardDirectory(sourceShardRoot),
    readShardDirectory(resourceShardRoot),
    readShardDirectory(resourceCShardRoot),
  ]);
  const sourceLedger = buildSourceLedger({ ast, existing: sourceExisting, shards: sourceShards, edges });
  const resourceCatalog = buildResourceCatalog({
    inventory: resourceInventory,
    existing: resourceExisting,
    shards: resourceShards,
    supplementalShards: resourceCShards,
  });
  const closedAst = {
    ...ast,
    semanticDependencyClosureComplete: edges.status === 'closed',
    closureStatus: edges.status,
    semanticDependencyLedger: 'spec/map/coverage/source-dependency-edges.json',
  };
  const outputs = [
    [resolve(coverageRoot, 'source-symbol-dispositions.json'), sourceLedger, false],
    [resolve(coverageRoot, 'resources.json'), resourceCatalog, false],
    [resolve(coverageRoot, 'java-ast-inventory.json.gz'), closedAst, true],
  ];
  if (mode === 'write') {
    for (const [path, value, compressed] of outputs) await atomicWrite(path, value, compressed);
    console.log(`Materialized ${sourceLedger.counts.dispositionedDeclarations} source dispositions and ${resourceCatalog.counts.total} resource dispositions.`);
    return;
  }
  if (mode !== 'check') throw new Error(`Unsupported mode: ${mode}`);
  for (const [path, value, compressed] of outputs) {
    const current = compressed ? stableJson(await readGzipJson(path)) : await readFile(path, 'utf8');
    if (current !== stableJson(value)) throw new Error(`Canonical ledger is stale: ${path}`);
  }
  console.log(`Verified ${sourceLedger.counts.dispositionedDeclarations} source dispositions and ${resourceCatalog.counts.total} resource dispositions.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv.includes('--write') ? 'write' : 'check';
  materializePlanLedgerShards(mode).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
