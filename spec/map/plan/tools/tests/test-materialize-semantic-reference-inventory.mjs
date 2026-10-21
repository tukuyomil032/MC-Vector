import assert from 'node:assert/strict';
import test from 'node:test';
import { validateSemanticReferenceInventory } from '../materialize-semantic-reference-inventory.mjs';

const REVISION = '93b454efb8802dc7406d6873434f2aeec5c636f4';

function inventory() {
  return {
    sourceRevision: REVISION,
    status: 'attribution_inventory_only_closure_open',
    closureComplete: false,
    counts: { references: 2, parseDiagnostics: 0, sourceFiles: 856, parsedFiles: 856 },
    references: [{ referenceId: 'one' }, { referenceId: 'two' }],
  };
}

test('accepts a complete parsed inventory while retaining open semantic closure', () => {
  const value = inventory();
  assert.equal(validateSemanticReferenceInventory(value), value);
});

test('rejects a different revision, a false closure claim, count drift, and parse errors', () => {
  assert.throws(() => validateSemanticReferenceInventory({ ...inventory(), sourceRevision: 'other' }), /pinned Dynmap revision/);
  assert.throws(() => validateSemanticReferenceInventory({ ...inventory(), closureComplete: true }), /open closure status/);
  assert.throws(() => validateSemanticReferenceInventory({ ...inventory(), counts: { ...inventory().counts, references: 1 } }), /counts disagree/);
  assert.throws(() => validateSemanticReferenceInventory({ ...inventory(), counts: { ...inventory().counts, parseDiagnostics: 1 } }), /counts disagree/);
});
