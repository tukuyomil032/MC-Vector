import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const PINNED_REVISION = '93b454efb8802dc7406d6873434f2aeec5c636f4';
const REQUIRED_CLASSIFICATIONS = new Set(['required', 'boundary_adapter', 'excluded']);
const REQUIRED_RESOURCE_SCOPES = new Set(['renderer-runtime', 'reference-only', 'boundary-adapter', 'excluded']);
const VERSION_STAGES = ['assets', 'anvil', 'paper-snapshot', 'reference-and-parity', 'real-acceptance'];

const setDiff = (expected, actual) => ({
  missing: [...expected].filter((value) => !actual.has(value)),
  extra: [...actual].filter((value) => !expected.has(value)),
});

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const hasIds = (value) => Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
const markdownTableText = (value) => String(value).replaceAll('|', '\\|').replaceAll('\n', '<br>');
const reportDiff = (label, { missing, extra }) => {
  if (missing.length || extra.length) {
    return `${label}: missing ${missing.length}${missing.length ? ` (${missing.slice(0, 3).join(', ')})` : ''}; `
      + `extra ${extra.length}${extra.length ? ` (${extra.slice(0, 3).join(', ')})` : ''}`;
  }
  return null;
};

export function validatePlanCompleteness({
  astInventory,
  resourceInventory,
  sourceDispositions,
  dependencyEdges,
  resources,
  builtins,
  builtinDispatchInventory,
  builtinBehaviorInventory,
  versions,
  versionDeltas,
  phaseGraph,
  phaseDocuments = new Map(),
  requireSemanticClosure = false,
  requireResourceClosure = false,
}) {
  const failures = [];
  const requireValue = (condition, message) => { if (!condition) failures.push(message); };
  const phaseNodes = new Map((phaseGraph?.nodes ?? []).map((node) => [node.id, node]));
  const normalizePlanDocument = (document) => document?.replace(/^spec\/map\/plan\//, '');

  requireValue(astInventory?.sourceRevision === PINNED_REVISION, 'source AST: missing or wrong pinned revision');
  requireValue(astInventory?.sourceRevisionProvenance === 'verified_against_git_commit_and_java_blob_ids', 'source AST: source revision provenance is not Git-verified');
  const declarations = Array.isArray(astInventory?.declarations) ? astInventory.declarations : [];
  const declarationsById = new Map(declarations.map((entry) => [entry.symbolId, entry]));
  const declarationIds = new Set(declarations.map((entry) => entry.symbolId).filter(isNonEmptyString));
  requireValue(declarations.length > 0 && declarationIds.size === declarations.length, 'source AST: declarations are empty or contain duplicate/missing IDs');
  requireValue(astInventory?.counts?.declarations === declarations.length && astInventory?.counts?.parseErrors === 0, 'source AST: inventory counts disagree or parse errors remain');

  const sourceRows = sourceDispositions?.entries;
  if (!Array.isArray(sourceRows)) {
    failures.push(`source dispositions: ledger missing for ${declarationIds.size} declarations`);
  } else {
    const actualIds = new Set(sourceRows.map((entry) => entry.symbolId).filter(isNonEmptyString));
    const difference = setDiff(declarationIds, actualIds);
    const message = reportDiff('source dispositions: declaration ID set differs from AST', difference);
    if (message) failures.push(message);
    if (actualIds.size !== sourceRows.length) failures.push('source dispositions: duplicate or missing symbol IDs');
    const incomplete = sourceRows.filter((entry) => {
      if (!REQUIRED_CLASSIFICATIONS.has(entry.classification)
          || !isNonEmptyString(entry.rationale)
          || !isNonEmptyString(entry.sourcePath)
          || !isNonEmptyString(entry.signature)
          || !Array.isArray(entry.dependencyEdgeIds)) return true;
      if (entry.classification === 'excluded') return !hasIds(entry.exclusionEvidenceIds);
      return !isNonEmptyString(entry.rustDestination)
        || !isNonEmptyString(entry.ownerPhaseId)
        || !isNonEmptyString(entry.ownerPhaseDocument)
        || !hasIds(entry.fixturePlanIds)
        || !hasIds(entry.referencePlanIds)
        || !hasIds(entry.focusedTestPlanIds)
        || !hasIds(entry.evidencePlanIds);
    });
    if (incomplete.length) failures.push(`source dispositions: ${incomplete.length} rows lack classification rationale or concrete plan ownership/proof IDs`);
    for (const row of sourceRows) {
      const declaration = declarationsById.get(row.symbolId);
      if (declaration && (row.sourcePath !== declaration.sourcePath || row.signature !== declaration.signature)) {
        failures.push(`source dispositions: source identity mismatch for ${row.symbolId}`);
        break;
      }
    }
  }

  const edgeRows = dependencyEdges?.edges;
  const unresolvedRows = dependencyEdges?.unresolved;
  const referenceCandidateCount = astInventory?.counts?.referenceCandidates;
  const edgeCounts = [
    dependencyEdges?.resolvedReferenceCandidateCount,
    dependencyEdges?.boundaryReferenceCandidateCount,
    dependencyEdges?.excludedReferenceCandidateCount,
    dependencyEdges?.unresolvedReferenceCandidateCount,
  ];
  const countsAreValid = edgeCounts.every((count) => Number.isSafeInteger(count) && count >= 0);
  const unresolvedBucketCount = Array.isArray(unresolvedRows)
    ? unresolvedRows.reduce((total, row) => total + (Number.isSafeInteger(row.candidateCount) ? row.candidateCount : 0), 0)
    : -1;
  const classifiedReferenceCount = countsAreValid ? edgeCounts.reduce((total, count) => total + count, 0) : -1;
  const ledgerOpen = dependencyEdges?.status === 'open' && dependencyEdges?.unresolvedReferenceCandidateCount > 0;
  const ledgerClosed = dependencyEdges?.status === 'closed' && dependencyEdges?.unresolvedReferenceCandidateCount === 0;
  if (dependencyEdges?.sourceRevision !== PINNED_REVISION
      || (!ledgerOpen && !ledgerClosed)
      || !Number.isSafeInteger(referenceCandidateCount)
      || dependencyEdges?.referenceCandidateCount !== referenceCandidateCount
      || classifiedReferenceCount !== referenceCandidateCount
      || unresolvedBucketCount !== dependencyEdges?.unresolvedReferenceCandidateCount
      || !Array.isArray(edgeRows) || !Array.isArray(unresolvedRows)
      || (ledgerClosed && unresolvedRows.length !== 0)
      || (ledgerOpen && unresolvedRows.length === 0)) {
    failures.push('dependency edges: candidate totals, classified rows, unresolved buckets, or open/closed state disagree');
  }
  if (astInventory?.semanticDependencyClosureComplete !== ledgerClosed
      || (ledgerClosed && astInventory?.closureStatus !== 'closed')
      || (ledgerOpen && !(typeof astInventory?.closureStatus === 'string' && astInventory.closureStatus.includes('open')))) {
    failures.push('source AST: semantic closure state disagrees with the dependency ledger');
  }
  if (requireSemanticClosure && !ledgerClosed) {
    failures.push(`source AST: strict semantic closure required; ${dependencyEdges?.unresolvedReferenceCandidateCount ?? 'unknown'} reference candidates remain unresolved`);
  }

  const edgeIds = new Set((edgeRows ?? []).map((entry) => entry.edgeId).filter(isNonEmptyString));
  if (edgeIds.size !== (edgeRows ?? []).length) failures.push('dependency edges: edge IDs are duplicate or missing');
  const edgeResolutionCounts = { resolved: 0, adapter_boundary: 0, justified_exclusion: 0 };
  const invalidEdges = (edgeRows ?? []).filter((entry) => {
    if (Object.hasOwn(edgeResolutionCounts, entry.resolution)) edgeResolutionCounts[entry.resolution] += 1;
    return !isNonEmptyString(entry.sourceSymbolId)
      || !Object.hasOwn(edgeResolutionCounts, entry.resolution)
      || (entry.resolution === 'resolved' && !isNonEmptyString(entry.targetSymbolId))
      || (entry.resolution !== 'resolved' && !isNonEmptyString(entry.rationale));
  });
  if (invalidEdges.length) failures.push(`dependency edges: ${invalidEdges.length} edges lack a resolved target or evidence-backed boundary disposition`);
  if (countsAreValid && (edgeResolutionCounts.resolved !== dependencyEdges.resolvedReferenceCandidateCount
      || edgeResolutionCounts.adapter_boundary !== dependencyEdges.boundaryReferenceCandidateCount
      || edgeResolutionCounts.justified_exclusion !== dependencyEdges.excludedReferenceCandidateCount)) {
    failures.push('dependency edges: classified edge rows do not match their declared resolution counts');
  }
  const edgeOwnerById = new Map();
  for (const row of sourceRows ?? []) for (const edgeId of row.dependencyEdgeIds ?? []) edgeOwnerById.set(edgeId, row.symbolId);
  const referencePointersByContext = new Map();
  for (const [candidateIndex, candidate] of (astInventory?.referenceCandidates ?? []).entries()) {
    if (!isNonEmptyString(candidate.contextSymbolId)) continue;
    const pointers = referencePointersByContext.get(candidate.contextSymbolId) ?? new Set();
    pointers.add(`spec/map/coverage/java-ast-inventory.json.gz#/referenceCandidates/${candidateIndex}`);
    referencePointersByContext.set(candidate.contextSymbolId, pointers);
  }
  for (const owner of sourceDispositions?.nonDeclarationEdgeOwners ?? []) {
    const expectedPointers = referencePointersByContext.get(owner.sourceSymbolId) ?? new Set();
    const pointers = owner.candidateInventoryPointers ?? [];
    const prefix = owner.sourceSymbolId?.split(':', 1)[0];
    const expectedOwnerKind = prefix === 'import' ? 'import-context'
      : prefix === 'initializer' ? 'initializer-context'
        : 'ast-reference-context';
    if (owner.ownerKind !== expectedOwnerKind
        || pointers.length === 0 || pointers.some((pointer) => !expectedPointers.has(pointer))) {
      failures.push(`dependency edges: non-declaration owner lacks exact AST reference-context candidate evidence (${owner.sourceSymbolId ?? 'missing owner'})`);
    }
    for (const edgeId of owner.dependencyEdgeIds ?? []) {
      if (edgeOwnerById.has(edgeId)) failures.push(`dependency edges: duplicate source owner for ${edgeId}`);
      edgeOwnerById.set(edgeId, owner.sourceSymbolId);
    }
  }
  if ((edgeRows ?? []).some((entry) => edgeOwnerById.get(entry.edgeId) !== entry.sourceSymbolId)
      || [...edgeOwnerById.keys()].some((edgeId) => !edgeIds.has(edgeId))) {
    failures.push('dependency edges: at least one edge has no matching source-symbol owner or ledger row');
  }

  const unresolvedIds = new Set();
  for (const row of unresolvedRows ?? []) {
    const phase = phaseNodes.get(row.phaseId);
    const document = normalizePlanDocument(row.phaseDocument);
    const pointers = Object.values(row.candidateInventoryPointers ?? {});
    if (!isNonEmptyString(row.id) || unresolvedIds.has(row.id)
        || !Number.isSafeInteger(row.candidateCount) || row.candidateCount <= 0
        || !isNonEmptyString(row.reason) || pointers.length === 0 || pointers.some((pointer) => !isNonEmptyString(pointer))
        || !phase || phase.document !== document || !phaseDocuments.has(document)) {
      failures.push(`dependency edges: unresolved candidate bucket lacks unique accounting or concrete phase ownership (${row.id ?? 'missing ID'})`);
    }
    unresolvedIds.add(row.id);
  }

  const inventoryResources = new Set(resourceInventory?.entries?.map((entry) => entry.sourcePath).filter(isNonEmptyString) ?? []);
  const catalogResources = new Set(resources?.entries?.map((entry) => entry.sourcePath).filter(isNonEmptyString) ?? []);
  if (resourceInventory?.sourceRevision !== PINNED_REVISION
      || !Array.isArray(resourceInventory?.entries)
      || resourceInventory?.counts?.resources !== resourceInventory.entries.length) {
    failures.push('resources: pinned inventory is absent or its exact path count is inconsistent');
  }
  const unclassifiedResourceRows = (resources?.entries ?? []).filter((entry) => entry.scope === 'unclassified');
  if (resources?.classificationComplete !== (unclassifiedResourceRows.length === 0)
      || resources?.counts?.unclassified !== unclassifiedResourceRows.length
      || resources?.counts?.total !== resourceInventory?.entries?.length) {
    failures.push('resources: classification counts must exactly match pinned paths and explicitly open rows');
  }
  if (requireResourceClosure && (resources?.consumerClosureComplete !== true || unclassifiedResourceRows.length !== 0)) {
    failures.push('resources: strict semantic consumer closure is required but remains open');
  }
  const resourceDiff = reportDiff('resources: disposition path set differs from pinned inventory', setDiff(inventoryResources, catalogResources));
  if (resourceDiff) failures.push(resourceDiff);
  const inventoryResourcesByPath = new Map((resourceInventory?.entries ?? []).map((entry) => [entry.sourcePath, entry]));
  const incompleteResources = (resources?.entries ?? []).filter((entry) => {
    const inventoryEntry = inventoryResourcesByPath.get(entry.sourcePath);
    if (!['unclassified', ...REQUIRED_RESOURCE_SCOPES].includes(entry.scope)
        || !/^[0-9a-f]{40}$/.test(entry.gitBlobSha1 ?? '')
        || !/^[0-9a-f]{64}$/.test(entry.contentSha256 ?? '')
        || entry.gitBlobSha1 !== inventoryEntry?.gitBlobSha1
        || entry.contentSha256 !== inventoryEntry?.contentSha256
        || entry.byteLength !== inventoryEntry?.byteLength
        || !isNonEmptyString(entry.ownerPhaseId)
        || !isNonEmptyString(entry.phaseDocument)) return true;
    if (entry.scope === 'unclassified') {
      return entry.resolutionStatus !== 'open'
        || !isNonEmptyString(entry.resolutionWorkId)
        || !isNonEmptyString(entry.unresolvedReason)
        || !hasIds(entry.fixturePlanIds)
        || !hasIds(entry.referencePlanIds)
        || !hasIds(entry.focusedTestPlanIds);
    }
    if (entry.scope === 'excluded') return !isNonEmptyString(entry.exclusionRationale) || !hasIds(entry.exclusionEvidenceIds);
    return !hasIds(entry.consumerSymbolIds) || !hasIds(entry.fixturePlanIds)
      || !hasIds(entry.referencePlanIds) || !hasIds(entry.focusedTestPlanIds);
  });
  if (incompleteResources.length) failures.push(`resources: ${incompleteResources.length} rows lack consumers, owner, or concrete verification-plan IDs`);

  if (phaseNodes.size === 0) failures.push('phase graph: no phase nodes are registered');
  for (const row of sourceRows ?? []) {
    const owner = phaseNodes.get(row.ownerPhaseId);
    if (row.classification !== 'excluded'
        && (!owner || owner.document !== row.ownerPhaseDocument || !phaseDocuments.has(owner.document))) {
      failures.push(`source dispositions: owner phase does not exist for ${row.symbolId}`);
      break;
    }
  }
  for (const entry of resources?.entries ?? []) {
    const owner = phaseNodes.get(entry.ownerPhaseId);
    if (!owner || owner.document !== entry.phaseDocument || !phaseDocuments.has(owner.document)) {
      failures.push(`resources: owner phase does not exist for ${entry.sourcePath}`);
      break;
    }
  }

  const builtinRows = builtins?.entries ?? [];
  if (!isNonEmptyString(builtins?.sourceRevision) || builtins.sourceRevision !== PINNED_REVISION
      || new Set(builtinRows.map((entry) => entry.class)).size !== builtinRows.length) {
    failures.push('built-ins: seed catalog has a missing/wrong source revision or duplicate class rows');
  }
  const builtinClassIds = new Set(builtinRows.map((entry) => entry.class).filter(isNonEmptyString));
  const dispatchClasses = builtinDispatchInventory?.classes ?? [];
  const behaviorClasses = builtinBehaviorInventory?.classes ?? [];
  const dispatchClassIds = new Set(dispatchClasses.map((entry) => entry.class).filter(isNonEmptyString));
  const behaviorClassIds = new Set(behaviorClasses.map((entry) => entry.class).filter(isNonEmptyString));
  const builtinClassSetMessage = reportDiff('built-ins: catalog/dispatch/behavior class sets differ', {
    missing: [...builtinClassIds].filter((id) => !dispatchClassIds.has(id) || !behaviorClassIds.has(id)),
    extra: [...new Set([...dispatchClassIds, ...behaviorClassIds])].filter((id) => !builtinClassIds.has(id)),
  });
  if (builtinClassSetMessage) failures.push(builtinClassSetMessage);
  if (builtinDispatchInventory?.sourceRevision !== PINNED_REVISION
      || builtinBehaviorInventory?.sourceRevision !== PINNED_REVISION
      || builtinDispatchInventory?.sourceTreeSha1 !== '632ec26b9f995c8c7acaf525325b359a8a996175'
      || builtinBehaviorInventory?.sourceTreeSha1 !== '632ec26b9f995c8c7acaf525325b359a8a996175') {
    failures.push('built-ins: pinned dispatch or Java behavior inventory is missing or not bound to the verified source tree');
  }
  const dynamicDispatch = builtinDispatchInventory?.dynamicDispatch;
  if (!isNonEmptyString(dynamicDispatch?.routeId)
      || !isNonEmptyString(dynamicDispatch?.parserSymbolId)
      || !isNonEmptyString(dynamicDispatch?.classLoaderSymbolId)
      || dynamicDispatch?.missingStaticDefinitionsRemainDynamicallyReachable !== true) {
    failures.push('built-ins: reflective registration/dispatch evidence is missing or incomplete');
  }
  const recomputedDefinitionCount = dispatchClasses.reduce((total, entry) => total + (entry.directDefinitions?.length ?? 0), 0);
  const recomputedMethodCount = behaviorClasses.reduce((total, entry) => total + (entry.methods?.length ?? 0), 0);
  const recomputedBranchCount = behaviorClasses.reduce((total, entry) => total
    + (entry.methods ?? []).reduce((methodTotal, method) => methodTotal + (method.branches?.length ?? 0), 0), 0);
  if (builtinDispatchInventory?.counts?.catalogClasses !== builtinRows.length
      || builtinDispatchInventory?.counts?.matchingCustomBlockRecords !== recomputedDefinitionCount
      || builtinBehaviorInventory?.counts?.classes !== builtinRows.length
      || builtinBehaviorInventory?.counts?.methods !== recomputedMethodCount
      || builtinBehaviorInventory?.counts?.branchSites !== recomputedBranchCount
      || builtinBehaviorInventory?.counts?.parseErrors !== 0
      || (builtinBehaviorInventory?.parseErrors?.length ?? 0) !== 0) {
    failures.push('built-ins: dispatch/behavior inventory counts disagree or Java parser errors remain');
  }

  const dispatchByClass = new Map(dispatchClasses.map((entry) => [entry.class, entry]));
  const behaviorByClass = new Map(behaviorClasses.map((entry) => [entry.class, entry]));
  for (const entry of builtinRows) {
    const phaseId = entry.phaseId;
    const document = entry.phaseDocument;
    const body = phaseDocuments.get(document);
    const requiredFields = ['registrationEvidenceIds', 'implementationSymbolIds', 'stateCaseIds', 'fixturePlanIds', 'referencePlanIds', 'focusedTestPlanIds', 'evidencePlanIds'];
    const phaseNode = phaseNodes.get(phaseId);
    if (!phaseNode || phaseNode.document !== document || !isNonEmptyString(document) || !body) {
      failures.push(`built-ins: phase owner/document missing for ${entry.class}`);
      continue;
    }
    const dispatchEntry = dispatchByClass.get(entry.class);
    const behaviorEntry = behaviorByClass.get(entry.class);
    const declarationsForClass = declarations.filter((declaration) => declaration.sourcePath === entry.sourcePath);
    const declarationIdsForClass = declarationsForClass.map((declaration) => declaration.symbolId).sort();
    const directDefinitions = dispatchEntry?.directDefinitions ?? [];
    const definitionIds = directDefinitions.map((definition) => definition.evidenceId).sort();
    const methods = behaviorEntry?.methods ?? [];
    const branchRows = methods.flatMap((method) => method.branches ?? []);
    const branchCaseIds = branchRows.flatMap((branch) => (branch.outcomes ?? []).map((outcome) => `CASE-${branch.branchId}-${outcome.outcomeIdSuffix}`)).sort();
    const configuredCaseIds = definitionIds.map((id) => `CASE-${id}`);
    const fallbackCaseIds = branchCaseIds.length === 0 && configuredCaseIds.length === 0
      ? [`CASE-${entry.class}-default-output`]
      : [];
    const expectedCaseIds = [...configuredCaseIds, ...branchCaseIds, ...fallbackCaseIds].sort();
    const expectedRegistrationIds = [dynamicDispatch?.routeId, ...definitionIds].filter(isNonEmptyString).sort();
    const actualSymbolIds = [...(entry.implementationSymbolIds ?? [])].sort();
    const expectedIds = {
      registrationEvidenceIds: expectedRegistrationIds,
      implementationSymbolIds: declarationIdsForClass,
      stateCaseIds: expectedCaseIds,
      branchCaseIds,
      fixturePlanIds: expectedCaseIds.map((id) => `FIX-${id}`).sort(),
      referencePlanIds: expectedCaseIds.map((id) => `REF-${id}`).sort(),
      focusedTestPlanIds: expectedCaseIds.map((id) => `TEST-${id}`).sort(),
      evidencePlanIds: expectedCaseIds.map((id) => `EVID-${id}`).sort(),
    };
    const missingFields = requiredFields.filter((field) => !hasIds(entry[field]));
    if (!Array.isArray(entry.branchCaseIds) || entry.branchCaseIds.length !== branchCaseIds.length) missingFields.push('branchCaseIds');
    for (const field of Object.keys(expectedIds)) {
      const actual = [...(entry[field] ?? [])].sort();
      if (JSON.stringify(actual) !== JSON.stringify(expectedIds[field])) {
        failures.push(`built-ins: ${entry.class} ${field} does not exactly match AST/dispatch/branch source evidence`);
        break;
      }
    }
    if (dispatchEntry?.sourcePath !== entry.sourcePath || behaviorEntry?.sourcePath !== entry.sourcePath
        || dispatchEntry?.dispatchKind !== entry.dispatchKind
        || entry.pinnedDefinitionCount !== directDefinitions.length
        || entry.behaviorMethodCount !== methods.length
        || entry.branchSiteCount !== branchRows.length
        || JSON.stringify(actualSymbolIds) !== JSON.stringify(declarationIdsForClass)
        || methods.some((method) => !declarationIdsForClass.includes(method.symbolId))
        || !isNonEmptyString(dispatchEntry?.sourceGitBlobSha1)
        || dispatchEntry.sourceGitBlobSha1 !== behaviorEntry?.sourceGitBlobSha1) {
      failures.push(`built-ins: ${entry.class} source identity, per-class AST declaration ownership, or behavior counts disagree`);
    }
    const invalidBranches = branchRows.filter((branch) => !isNonEmptyString(branch.branchId)
      || !isNonEmptyString(branch.condition)
      || !Array.isArray(branch.outcomes)
      || branch.outcomes.length < 2
      || branch.outcomes.some((outcome) => !isNonEmptyString(outcome.outcomeIdSuffix) || !isNonEmptyString(outcome.meaning)));
    if (invalidBranches.length) failures.push(`built-ins: ${entry.class} has ${invalidBranches.length} branch sites without complete source-derived outcomes`);

    const requiredPageDetails = [
      ...Object.values(expectedIds).flat(),
      ...methods.flatMap((method) => [method.symbolId, method.signature]),
      ...branchRows.flatMap((branch) => [branch.branchId, branch.kind, markdownTableText(branch.condition),
        ...(branch.outcomes ?? []).flatMap((outcome) => [markdownTableText(outcome.meaning), ...(outcome.labels ?? []).map(markdownTableText)])]),
      ...directDefinitions.flatMap((definition) => [definition.sourcePath, String(definition.sourceLine)]),
    ];
    const missingPageIds = requiredPageDetails.filter((id) => !body.includes(id));
    if (missingFields.length || missingPageIds.length || !body.includes('## Class-specific state and branch matrix')
        || !body.includes('### Exact implementation symbols') || !body.includes('### Source-derived branch/outcome matrix')) {
      failures.push(`built-ins: ${entry.class} page lacks exact dispatch, AST declaration, branch, fixture, reference, or focused-test detail (${missingFields.join(', ') || `${missingPageIds.length} missing evidence details: ${missingPageIds.slice(0, 4).join(', ')}`})`);
    }
  }

  const versionIds = new Set((versions?.entries ?? []).map((entry) => entry.minecraftVersion));
  const deltaRows = versionDeltas?.entries ?? [];
  const deltaIds = new Set(deltaRows.map((entry) => entry.minecraftVersion));
  const deltaSetMessage = reportDiff('versions: exact-release delta set differs from official matrix', setDiff(versionIds, deltaIds));
  if (deltaSetMessage) failures.push(deltaSetMessage);
  if (versionDeltas?.snapshotDate !== versions?.snapshotDate) failures.push('versions: delta matrix is not bound to the official release snapshot date');
  for (const version of versionIds) {
    for (const stage of VERSION_STAGES) {
      const document = `phases/versions/${version}/${stage}.md`;
      const stageNode = [...phaseNodes.values()].find((node) => node.kind === 'version' && node.document === document);
      if (!stageNode || !phaseDocuments.has(document)) failures.push(`versions: stage phase missing from graph/document for ${version}/${stage}`);
    }
  }
  for (const version of versionIds) {
    const delta = deltaRows.find((entry) => entry.minecraftVersion === version);
    const expectedReports = [
      ['rendererAssets', 'assets'],
      ['savedAnvil', 'anvil'],
      ['dynmapOracle', 'dynmap-oracle'],
      ['paperLive', 'paper'],
      ['referenceParity', 'parity'],
    ];
    for (const [field, reportName] of expectedReports) {
      const record = field === 'paperLive' ? delta?.paperLive?.report : delta?.[field];
      const expectedPath = `spec/map/evidence/version-deltas/${version}/${reportName}.json`;
      if (record?.path !== expectedPath) {
        failures.push(`versions: ${version} ${field} has no exact-release report destination`);
      }
    }
    const parity = delta?.referenceParity;
    const parityPlan = delta?.referenceParityPlan;
    const parityDocumentPath = `phases/versions/${version}/reference-and-parity.md`;
    const parityNode = phaseNodes.get(`V-${version}-reference-and-parity`);
    const assetPlanDocument = phaseDocuments.get(`phases/versions/${version}/assets.md`);
    if (parity?.status !== 'pending'
        || parityPlan?.status !== 'planned_not_evidence'
        || parityPlan?.phaseId !== `V-${version}-reference-and-parity`
        || parityPlan?.phaseDocument !== parityDocumentPath
        || parityNode?.document !== parityDocumentPath
        || !Array.isArray(parityPlan?.inputAxes) || parityPlan.inputAxes.length < 3
        || !Array.isArray(parityPlan?.comparisonOutputs) || parityPlan.comparisonOutputs.length < 3
        || parityPlan?.implementationProfileRule !== 'decide_from_exact_per_change_reference_pixel_parity'
        || !assetPlanDocument?.includes('fixture→exact-version Dynmap trace→Rust pixel comparison')) {
      failures.push(`versions: ${version} lacks a concrete per-release parity work plan`);
    }
  }

  return failures;
}

async function loadJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function loadGzipJson(path) {
  return JSON.parse(gunzipSync(await readFile(path)).toString('utf8'));
}

async function run() {
  const repositoryRoot = resolve(import.meta.dirname, '../../../..');
  const coverageRoot = resolve(repositoryRoot, 'spec/map/coverage');
  const planRoot = resolve(repositoryRoot, 'spec/map/plan');
  const failures = [];
  const optional = async (path, label, loader) => {
    try { return await loader(path); } catch { failures.push(`${label}: missing or unreadable`); return null; }
  };
  const astInventory = await optional(resolve(coverageRoot, 'java-ast-inventory.json.gz'), 'source AST inventory', loadGzipJson);
  const resourceInventory = await optional(resolve(coverageRoot, 'pinned-resource-inventory.json.gz'), 'pinned resource inventory', loadGzipJson);
  const sourceDispositions = await optional(resolve(coverageRoot, 'source-symbol-dispositions.json'), 'source disposition ledger', loadJson);
  const dependencyEdges = await optional(resolve(coverageRoot, 'source-dependency-edges.json'), 'dependency edge ledger', loadJson);
  const resources = await optional(resolve(coverageRoot, 'resources.json'), 'resource disposition catalog', loadJson);
  const builtins = await optional(resolve(coverageRoot, 'builtin-renderers.json'), 'built-in renderer catalog', loadJson);
  const builtinDispatchInventory = await optional(resolve(coverageRoot, 'builtin-dispatch-inventory.json'), 'built-in dispatch inventory', loadJson);
  const builtinBehaviorInventory = await optional(resolve(coverageRoot, 'builtin-behavior-inventory.json.gz'), 'built-in behavior inventory', loadGzipJson);
  const versions = await optional(resolve(coverageRoot, 'version-matrix.json'), 'version matrix', loadJson);
  const versionDeltas = await optional(resolve(coverageRoot, 'version-delta-matrix.json'), 'version delta matrix', loadJson);
  const phaseGraph = await optional(resolve(planRoot, 'coverage/phase-graph.json'), 'phase graph', loadJson);
  const phaseDocuments = new Map();

  if (phaseGraph?.nodes) {
    for (const node of phaseGraph.nodes) {
      const path = resolve(planRoot, node.document ?? '');
      try { phaseDocuments.set(node.document, await readFile(path, 'utf8')); }
      catch { failures.push(`phase graph: missing phase document ${node.document}`); }
    }
  }
  for (const entry of builtins?.entries ?? []) {
    const path = resolve(planRoot, entry.phaseDocument ?? '');
    if (phaseDocuments.has(entry.phaseDocument)) continue;
    try { phaseDocuments.set(entry.phaseDocument, await readFile(path, 'utf8')); }
    catch { /* reported by validatePlanCompleteness */ }
  }
  for (const entry of versions?.entries ?? []) for (const stage of VERSION_STAGES) {
    const document = `phases/versions/${entry.minecraftVersion}/${stage}.md`;
    if (phaseDocuments.has(document)) continue;
    try { phaseDocuments.set(document, await readFile(resolve(planRoot, document), 'utf8')); }
    catch { /* reported by validatePlanCompleteness */ }
  }

  const requireSemanticClosure = process.argv.includes('--require-semantic-closure');
  const requireResourceClosure = process.argv.includes('--require-resource-closure');
  const planFailures = validatePlanCompleteness({
    astInventory,
    resourceInventory,
    sourceDispositions,
    dependencyEdges,
    resources,
    builtins,
    builtinDispatchInventory,
    builtinBehaviorInventory,
    versions,
    versionDeltas,
    phaseGraph,
    phaseDocuments,
    requireSemanticClosure,
    requireResourceClosure,
  });
  failures.push(...planFailures);
  if (failures.length) {
    console.error(`Map renderer plan is not complete (${failures.length}):\n- ${failures.join('\n- ')}`);
    process.exitCode = 1;
  } else {
    const unresolvedReferences = dependencyEdges.unresolvedReferenceCandidateCount;
    const resourceClosure = resources.consumerClosureComplete ? 'closed' : 'open and assigned to planned phases';
    console.log(`Plan ownership complete: ${astInventory.counts.declarations} declarations, ${astInventory.counts.referenceCandidates} reference candidates (${unresolvedReferences} explicitly assigned to phases), ${resourceInventory.counts.resources} resources (consumer closure ${resourceClosure}), ${builtins.entries.length} built-ins, ${versions.entries.length} exact releases. This does not claim semantic closure, renderer implementation, or acceptance evidence.`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.slice(2).some((argument) => !['--require-semantic-closure', '--require-resource-closure'].includes(argument))) {
    console.error('Usage: node plan-completeness.mjs [--require-semantic-closure] [--require-resource-closure]');
    process.exit(2);
  }
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
