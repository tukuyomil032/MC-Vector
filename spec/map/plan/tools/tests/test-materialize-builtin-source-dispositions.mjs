import assert from 'node:assert/strict';
import test from 'node:test';
import { materializeBuiltinSourceDispositions } from '../materialize-builtin-source-dispositions.mjs';

const revision = '93b454efb8802dc7406d6873434f2aeec5c636f4';
const tree = '632ec26b9f995c8c7acaf525325b359a8a996175';
const sourcePath = 'DynmapCore/src/main/java/org/dynmap/hdmap/renderer/BoxRenderer.java';
const symbolId = 'method:type:org.dynmap.hdmap.renderer.BoxRenderer#getRenderPatchList(MapDataContext)';
const fixtureId = 'FIX-CASE-renderer';

function inputs() {
  return {
    astInventory: {
      sourceRevision: revision,
      sourceTreeSha1: tree,
      declarations: [{ symbolId, sourcePath, signature: 'BoxRenderer#getRenderPatchList(MapDataContext)', startLine: 5, endLine: 9 }],
      sourceFiles: [{ sourcePath, gitBlobSha1: 'a'.repeat(40), contentSha256: 'b'.repeat(64) }],
    },
    builtinCatalog: {
      sourceRevision: revision,
      sourceTreeSha1: tree,
      entries: [{
        class: 'BoxRenderer', sourcePath, rustModule: 'src-tauri/crates/map-renderer-core/src/builtins/simple.rs',
        phaseId: 'B-box-renderer', phaseDocument: 'phases/builtins/box-renderer.md',
        registrationEvidenceIds: ['DISPATCH-CUSTOMBLOCK-CLASS-REFLECTION'], implementationSymbolIds: [symbolId],
        fixturePlanIds: [fixtureId], referencePlanIds: ['REF-CASE-renderer'],
        focusedTestPlanIds: ['TEST-CASE-renderer'], evidencePlanIds: ['EVID-CASE-renderer'],
      }],
    },
    dependencyCandidates: {
      sourceRevision: revision, sourceTreeSha1: tree, closureComplete: false,
      edges: [{ edgeId: 'EDGE-model', sourceSymbolId: symbolId }],
    },
  };
}

test('maps every declaration of each audited built-in to its exact phase and proof plans', () => {
  const ledger = materializeBuiltinSourceDispositions(inputs());
  assert.equal(ledger.counts.dispositionedDeclarations, 1);
  assert.equal(ledger.counts.undispositionedDeclarations, 0);
  assert.equal(ledger.status, 'partial_builtin_declarations_only_closure_open');
  assert.deepEqual(ledger.entries[0].dependencyEdgeIds, ['EDGE-model']);
  assert.deepEqual(ledger.entries[0].evidencePlanIds, ['EVID-CASE-renderer']);
  assert.equal(ledger.entries[0].classification, 'required');
});

test('rejects stale source provenance, missing AST symbols, and catalog symbol drift', () => {
  const wrongPin = inputs();
  wrongPin.builtinCatalog.sourceRevision = '0'.repeat(40);
  assert.throws(() => materializeBuiltinSourceDispositions(wrongPin), /pinned Dynmap revision/);

  const missingAstSymbol = inputs();
  missingAstSymbol.builtinCatalog.entries[0].implementationSymbolIds.push('field:missing');
  assert.throws(() => materializeBuiltinSourceDispositions(missingAstSymbol), /AST symbol set differs/);

  const falselyClosed = inputs();
  falselyClosed.dependencyCandidates.closureComplete = true;
  assert.throws(() => materializeBuiltinSourceDispositions(falselyClosed), /must remain explicitly open/);
});
