import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePlanCompleteness } from '../plan-completeness.mjs';

const digest40 = 'a'.repeat(40);
const digest64 = 'b'.repeat(64);
const version = '1.21.10';
const stages = ['assets', 'anvil', 'paper-snapshot', 'reference-and-parity', 'real-acceptance'];

function validInputs() {
  const symbolId = 'method:org.dynmap.Renderer#render()';
  const resourcePath = 'DynmapCore/src/main/resources/hdmap/perspectives.txt';
  const builtinDocument = 'phases/builtins/box-renderer.md';
  const configCaseId = 'CASE-REG-box';
  const trueCaseId = 'CASE-FLOW-box-true';
  const falseCaseId = 'CASE-FLOW-box-false';
  const routeId = 'DISPATCH-CUSTOMBLOCK-CLASS-REFLECTION';
  const versionDocument = (stage) => `phases/versions/${version}/${stage}.md`;
  const phaseDocuments = new Map([
    ['phases/phase-render.md', 'concrete render plan'],
    [builtinDocument, [
      '## Class-specific state and branch matrix',
      '### Exact implementation symbols',
      '### Source-derived branch/outcome matrix',
      routeId,
      'REG-box',
      symbolId,
      'Renderer#render()',
      'org.dynmap.Renderer#render()->void',
      'FLOW-box',
      'if',
      'state == expected',
      'condition true',
      'condition false',
      'DynmapCore/src/main/resources/models_0.txt',
      '12',
      configCaseId,
      trueCaseId,
      falseCaseId,
      `FIX-${configCaseId}`,
      `FIX-${trueCaseId}`,
      `FIX-${falseCaseId}`,
      `REF-${configCaseId}`,
      `REF-${trueCaseId}`,
      `REF-${falseCaseId}`,
      `TEST-${configCaseId}`,
      `TEST-${trueCaseId}`,
      `TEST-${falseCaseId}`,
      `EVID-${configCaseId}`,
      `EVID-${trueCaseId}`,
      `EVID-${falseCaseId}`,
    ].join('\n')],
    ...stages.map((stage) => [versionDocument(stage), stage === 'assets'
      ? 'fixture→exact-version Dynmap trace→Rust pixel comparison'
      : 'exact-version plan']),
  ]);
  const fileDigest = { gitBlobSha1: digest40, contentSha256: digest64, byteLength: 17 };

  return {
    astInventory: {
      sourceRevision: '93b454efb8802dc7406d6873434f2aeec5c636f4',
      sourceRevisionProvenance: 'verified_against_git_commit_and_java_blob_ids',
      semanticDependencyClosureComplete: true,
      closureStatus: 'closed',
      counts: { declarations: 1, parseErrors: 0, referenceCandidates: 1 },
    declarations: [{ symbolId, sourcePath: 'DynmapCore/src/main/java/org/dynmap/Renderer.java', signature: 'Renderer#render()', startLine: 1, endLine: 5 }],
    },
    resourceInventory: {
      sourceRevision: '93b454efb8802dc7406d6873434f2aeec5c636f4',
      classificationComplete: true,
      consumerClosureComplete: true,
      counts: { resources: 1 },
      entries: [{ sourcePath: resourcePath, ...fileDigest }],
    },
    sourceDispositions: {
      entries: [{
        symbolId,
        sourcePath: 'DynmapCore/src/main/java/org/dynmap/Renderer.java',
        signature: 'Renderer#render()',
        classification: 'required',
        rationale: 'This method determines projected pixel output.',
        dependencyEdgeIds: ['edge-render-model'],
        rustDestination: 'src/renderer.rs',
        ownerPhaseId: 'P-RENDER',
        ownerPhaseDocument: 'phases/phase-render.md',
        fixturePlanIds: ['FX-render'],
        referencePlanIds: ['REF-render'],
        focusedTestPlanIds: ['TEST-render'],
        evidencePlanIds: ['EVID-render'],
        implementationStatus: 'not_started',
      }],
    },
    dependencyEdges: {
      sourceRevision: '93b454efb8802dc7406d6873434f2aeec5c636f4',
      status: 'closed',
      referenceCandidateCount: 1,
      resolvedReferenceCandidateCount: 1,
      boundaryReferenceCandidateCount: 0,
      excludedReferenceCandidateCount: 0,
      unresolvedReferenceCandidateCount: 0,
      unresolved: [],
      edges: [{ edgeId: 'edge-render-model', sourceSymbolId: symbolId, targetSymbolId: 'type:org.dynmap.Model', resolution: 'resolved' }],
    },
    resources: {
      classificationComplete: true,
      consumerClosureComplete: true,
      counts: { total: 1, unclassified: 0 },
      entries: [{
        sourcePath: resourcePath,
        ...fileDigest,
        scope: 'renderer-runtime',
        ownerPhaseId: 'P-RENDER',
        phaseDocument: 'phases/phase-render.md',
        consumerSymbolIds: [symbolId],
        fixturePlanIds: ['FX-resource'],
        referencePlanIds: ['REF-resource'],
        focusedTestPlanIds: ['TEST-resource'],
      }],
    },
    builtins: {
      sourceRevision: '93b454efb8802dc7406d6873434f2aeec5c636f4',
      entries: [{
        class: 'BoxRenderer',
        sourcePath: 'DynmapCore/src/main/java/org/dynmap/Renderer.java',
        phaseId: 'B-box-renderer',
        phaseDocument: builtinDocument,
        sourceRevision: '93b454efb8802dc7406d6873434f2aeec5c636f4',
        dispatchKind: 'static_and_reflection',
        pinnedDefinitionCount: 1,
        behaviorMethodCount: 1,
        branchSiteCount: 1,
        registrationEvidenceIds: [routeId, 'REG-box'],
        implementationSymbolIds: [symbolId],
        stateCaseIds: [configCaseId, trueCaseId, falseCaseId],
        branchCaseIds: [trueCaseId, falseCaseId],
        fixturePlanIds: [`FIX-${configCaseId}`, `FIX-${trueCaseId}`, `FIX-${falseCaseId}`],
        referencePlanIds: [`REF-${configCaseId}`, `REF-${trueCaseId}`, `REF-${falseCaseId}`],
        focusedTestPlanIds: [`TEST-${configCaseId}`, `TEST-${trueCaseId}`, `TEST-${falseCaseId}`],
        evidencePlanIds: [`EVID-${configCaseId}`, `EVID-${trueCaseId}`, `EVID-${falseCaseId}`],
      }],
    },
    builtinDispatchInventory: {
      sourceRevision: '93b454efb8802dc7406d6873434f2aeec5c636f4',
      sourceTreeSha1: '632ec26b9f995c8c7acaf525325b359a8a996175',
      counts: { catalogClasses: 1, matchingCustomBlockRecords: 1 },
      dynamicDispatch: {
        routeId,
        parserSymbolId: 'method:type:org.dynmap.hdmap.HDBlockModels#loadModelFile',
        classLoaderSymbolId: 'constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e',
        missingStaticDefinitionsRemainDynamicallyReachable: true,
      },
      classes: [{
        class: 'BoxRenderer',
        sourcePath: 'DynmapCore/src/main/java/org/dynmap/Renderer.java',
        sourceGitBlobSha1: digest40,
        dispatchKind: 'static_and_reflection',
        directDefinitions: [{ evidenceId: 'REG-box', sourcePath: 'DynmapCore/src/main/resources/models_0.txt', sourceLine: 12 }],
      }],
    },
    builtinBehaviorInventory: {
      sourceRevision: '93b454efb8802dc7406d6873434f2aeec5c636f4',
      sourceTreeSha1: '632ec26b9f995c8c7acaf525325b359a8a996175',
      counts: { classes: 1, methods: 1, branchSites: 1, parseErrors: 0 },
      parseErrors: [],
      classes: [{
        class: 'BoxRenderer',
        sourcePath: 'DynmapCore/src/main/java/org/dynmap/Renderer.java',
        sourceGitBlobSha1: digest40,
        methods: [{
          symbolId,
          signature: 'org.dynmap.Renderer#render()->void',
          branches: [{
            branchId: 'FLOW-box',
            kind: 'if',
            condition: 'state == expected',
            outcomes: [
              { outcomeIdSuffix: 'true', meaning: 'condition true' },
              { outcomeIdSuffix: 'false', meaning: 'condition false' },
            ],
          }],
        }],
      }],
    },
    versions: {
      snapshotDate: '2026-09-23',
      entries: [{ minecraftVersion: version }],
    },
    versionDeltas: {
      snapshotDate: '2026-09-23',
      entries: [{
        minecraftVersion: version,
        artifacts: Object.fromEntries(['clientJar', 'serverJar', 'assetIndex'].map((key) => [key, {
          downloadedSha256: null,
          officialSha1: digest40,
          byteLength: 100,
        }])),
        rendererAssets: { status: 'pending', path: `spec/map/evidence/version-deltas/${version}/assets.json`, sha256: null, inputFingerprints: null },
        savedAnvil: { status: 'pending', path: `spec/map/evidence/version-deltas/${version}/anvil.json`, sha256: null, inputFingerprints: null },
        dynmapOracle: { status: 'pending', path: `spec/map/evidence/version-deltas/${version}/dynmap-oracle.json`, sha256: null, inputFingerprints: null },
        paperLive: { status: 'unverified', report: { status: 'pending', path: `spec/map/evidence/version-deltas/${version}/paper.json`, sha256: null, inputFingerprints: null } },
        referenceParity: { status: 'pending', path: `spec/map/evidence/version-deltas/${version}/parity.json`, sha256: null, inputFingerprints: null },
        referenceParityPlan: {
          phaseId: `V-${version}-reference-and-parity`,
          phaseDocument: `phases/versions/${version}/reference-and-parity.md`,
          inputAxes: ['renderer-consumed-block-state-model-texture-deltas', 'saved-anvil-schema-delta', 'exact-version-dynmap-source-delta'],
          comparisonOutputs: ['intermediate-renderer-trace', 'normalized-rgba-pixel-diff', 'deterministic-png-sha256'],
          implementationProfileRule: 'decide_from_exact_per_change_reference_pixel_parity',
          status: 'planned_not_evidence',
        },
      }],
    },
    phaseGraph: {
      nodes: [
        { id: 'P-RENDER', document: 'phases/phase-render.md' },
        { id: 'B-box-renderer', document: builtinDocument },
        ...stages.map((stage) => ({
          id: `V-${version}-${stage}`,
          kind: 'version',
          document: versionDocument(stage),
        })),
      ],
    },
    phaseDocuments,
  };
}

test('plan completeness accepts fully mapped plan entries without runtime implementation proof', () => {
  assert.deepEqual(validatePlanCompleteness(validInputs()), []);
});

test('plan completeness requires exact source declaration set and reports missing IDs', () => {
  const input = validInputs();
  input.sourceDispositions.entries = [];
  const failures = validatePlanCompleteness(input);
  assert.ok(failures.some((failure) => failure.includes('source dispositions: declaration ID set differs from AST')));
});

test('plan completeness requires concrete per-release data and parity work without claiming evidence exists', () => {
  const input = validInputs();
  input.versionDeltas.entries[0].referenceParityPlan.inputAxes = [];
  const failures = validatePlanCompleteness(input);
  assert.ok(failures.some((failure) => failure.includes(`versions: ${version} lacks a concrete per-release parity work plan`)));
});

test('plan ownership accepts counted open source/resource closure when every remaining item has an owner phase', () => {
  const input = validInputs();
  input.astInventory.counts.referenceCandidates = 2;
  input.astInventory.semanticDependencyClosureComplete = false;
  input.astInventory.closureStatus = 'syntax_inventory_verified_semantic_closure_open';
  input.dependencyEdges.status = 'open';
  input.dependencyEdges.referenceCandidateCount = 2;
  input.dependencyEdges.resolvedReferenceCandidateCount = 1;
  input.dependencyEdges.unresolvedReferenceCandidateCount = 1;
  input.dependencyEdges.unresolved = [{
    id: 'UNRESOLVED-ONE-CANDIDATE',
    candidateCount: 1,
    phaseId: 'P-RENDER',
    phaseDocument: 'spec/map/plan/phases/phase-render.md',
    reason: 'Resolve this exact remaining candidate before renderer implementation is declared complete.',
    candidateInventoryPointers: { ast: 'spec/map/coverage/java-ast-inventory.json.gz#/referenceCandidates/1' },
  }];
  input.resources.consumerClosureComplete = false;

  assert.deepEqual(validatePlanCompleteness(input), []);
});

test('strict closure options reject open semantic work without invalidating the complete plan', () => {
  const input = validInputs();
  input.astInventory.counts.referenceCandidates = 2;
  input.astInventory.semanticDependencyClosureComplete = false;
  input.astInventory.closureStatus = 'syntax_inventory_verified_semantic_closure_open';
  input.dependencyEdges.status = 'open';
  input.dependencyEdges.referenceCandidateCount = 2;
  input.dependencyEdges.resolvedReferenceCandidateCount = 1;
  input.dependencyEdges.unresolvedReferenceCandidateCount = 1;
  input.dependencyEdges.unresolved = [{
    id: 'UNRESOLVED-ONE-CANDIDATE',
    candidateCount: 1,
    phaseId: 'P-RENDER',
    phaseDocument: 'phases/phase-render.md',
    reason: 'Resolve this exact remaining candidate before renderer implementation is declared complete.',
    candidateInventoryPointers: { ast: 'spec/map/coverage/java-ast-inventory.json.gz#/referenceCandidates/1' },
  }];
  input.resources.consumerClosureComplete = false;

  const failures = validatePlanCompleteness({ ...input, requireSemanticClosure: true, requireResourceClosure: true });
  assert.ok(failures.some((failure) => failure.includes('strict semantic closure required')));
  assert.ok(failures.some((failure) => failure.includes('strict semantic consumer closure is required')));
});

test('open reference buckets require exact candidate accounting, pointers, and a registered owner phase', () => {
  const input = validInputs();
  input.astInventory.counts.referenceCandidates = 2;
  input.astInventory.semanticDependencyClosureComplete = false;
  input.astInventory.closureStatus = 'syntax_inventory_verified_semantic_closure_open';
  input.dependencyEdges.status = 'open';
  input.dependencyEdges.referenceCandidateCount = 2;
  input.dependencyEdges.resolvedReferenceCandidateCount = 1;
  input.dependencyEdges.unresolvedReferenceCandidateCount = 1;
  input.dependencyEdges.unresolved = [{
    id: 'UNRESOLVED-ONE-CANDIDATE',
    candidateCount: 2,
    phaseId: 'P-MISSING',
    phaseDocument: 'phases/missing.md',
    reason: 'Needs source-context resolution.',
    candidateInventoryPointers: {},
  }];

  const failures = validatePlanCompleteness(input);
  assert.ok(failures.some((failure) => failure.includes('candidate totals, classified rows')));
  assert.ok(failures.some((failure) => failure.includes('unresolved candidate bucket lacks')));
});

test('plan completeness does not require downloaded runtime artifacts before implementation', () => {
  assert.deepEqual(validatePlanCompleteness(validInputs()), []);
});

test('plan completeness rejects resource inventory/catalog path or digest drift', () => {
  const input = validInputs();
  input.resources.entries[0].contentSha256 = 'c'.repeat(64);
  const failures = validatePlanCompleteness(input);
  assert.ok(failures.some((failure) => failure.includes('resources: 1 rows lack consumers')));
});

test('plan completeness requires built-in-specific branch and proof plan', () => {
  const input = validInputs();
  input.phaseDocuments.set('phases/builtins/box-renderer.md', 'generic shared renderer notes');
  const failures = validatePlanCompleteness(input);
  assert.ok(failures.some((failure) => failure.includes('built-ins: BoxRenderer page lacks exact dispatch')));
});
