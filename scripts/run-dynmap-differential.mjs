import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const manifestPath = resolve('tests/fixtures/dynmap/manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const expectedRevision = '93b454efb8802dc7406d6873434f2aeec5c636f4';
const requiredCases = [
  'flat',
  'mountain-cliff',
  'water',
  'forest-leaves',
  'snow',
  'stairs',
  'slabs',
  'fences',
  'doors',
  'glass',
  'chunk-boundary',
  'missing-texture',
  'malformed-chunk',
  'unloaded-chunk',
  'custom-resource-pack',
];

if (manifest.schemaVersion !== 1 || manifest.sourceRevision !== expectedRevision) {
  throw new Error('Dynmap fixture manifest schema or pinned revision mismatch');
}

const cases = new Map(manifest.cases.map((fixture) => [fixture.id, fixture]));
for (const id of requiredCases) {
  const fixture = cases.get(id);
  if (!fixture) throw new Error(`Missing Dynmap fixture case: ${id}`);
  if (fixture.expectedGeneratedAt !== null) {
    throw new Error(`Fixture ${id} contains a generated-at golden marker`);
  }
  if (typeof fixture.sourceSymbol !== 'string' || fixture.sourceSymbol.length === 0) {
    throw new Error(`Fixture ${id} has no source symbol mapping`);
  }
}

const strictReference = process.argv.includes('--strict-reference');
const pending = manifest.referenceStatus !== 'recorded';
console.log(`validated ${cases.size} fixed Dynmap fixture declarations`);
console.log(`pinned revision: ${manifest.sourceRevision}`);
if (pending) {
  console.log('reference captures: pending (Rust contract vectors only)');
  if (strictReference) {
    process.exitCode = 2;
  }
} else {
  console.log('reference captures: recorded');
}
