#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const PINNED_REVISION = '93b454efb8802dc7406d6873434f2aeec5c636f4';
const PINNED_TREE = '632ec26b9f995c8c7acaf525325b359a8a996175';
const scriptDirectory = resolve(import.meta.dirname);
const repositoryRoot = resolve(scriptDirectory, '../../../../');
const coverageRoot = resolve(repositoryRoot, 'spec/map/coverage');
const readJson = async (path) => JSON.parse(await readFile(resolve(repositoryRoot, path), 'utf8'));
const readGzipJson = async (path) => JSON.parse(gunzipSync(await readFile(resolve(repositoryRoot, path))).toString('utf8'));
const fail = (message) => { throw new Error(message); };
const sortedUnique = (values) => [...new Set(values)].sort();

export function materializeBuiltinSourceDispositions({ astInventory, builtinCatalog, dependencyCandidates }) {
  for (const inventory of [astInventory, dependencyCandidates]) {
    if (inventory?.sourceRevision !== PINNED_REVISION || inventory?.sourceTreeSha1 !== PINNED_TREE) {
      fail('Input inventory is not bound to the pinned Dynmap Git tree');
    }
  }
  if (builtinCatalog?.sourceRevision !== PINNED_REVISION) fail('Built-in catalog does not use the pinned Dynmap revision');
  if (dependencyCandidates.closureComplete !== false) fail('Candidate dependency graph must remain explicitly open');

  const declarationsById = new Map((astInventory.declarations ?? []).map((row) => [row.symbolId, row]));
  if (declarationsById.size !== astInventory.declarations?.length) fail('AST declaration IDs are duplicate or missing');
  const sourceFilesByPath = new Map((astInventory.sourceFiles ?? []).map((row) => [row.sourcePath, row]));
  const edgesBySource = new Map();
  for (const edge of dependencyCandidates.edges ?? []) {
    const rows = edgesBySource.get(edge.sourceSymbolId) ?? [];
    rows.push(edge.edgeId);
    edgesBySource.set(edge.sourceSymbolId, rows);
  }

  const entries = [];
  const seenSymbolIds = new Set();
  for (const renderer of builtinCatalog.entries ?? []) {
    if (!renderer.rustModule || !renderer.phaseId || !renderer.phaseDocument || !renderer.registrationEvidenceIds?.length
        || !renderer.fixturePlanIds?.length || !renderer.referencePlanIds?.length || !renderer.focusedTestPlanIds?.length
        || !renderer.evidencePlanIds?.length) {
      fail(`Built-in renderer plan lacks an owner or proof plan: ${renderer.class}`);
    }
    const expectedIds = sortedUnique((astInventory.declarations ?? [])
      .filter((row) => row.sourcePath === renderer.sourcePath)
      .map((row) => row.symbolId));
    const catalogIds = sortedUnique(renderer.implementationSymbolIds ?? []);
    if (JSON.stringify(expectedIds) !== JSON.stringify(catalogIds)) {
      fail(`Built-in AST symbol set differs from catalog for ${renderer.class}`);
    }
    for (const symbolId of catalogIds) {
      if (seenSymbolIds.has(symbolId)) fail(`Built-in declaration has multiple owners: ${symbolId}`);
      seenSymbolIds.add(symbolId);
      const declaration = declarationsById.get(symbolId);
      if (!declaration || declaration.sourcePath !== renderer.sourcePath) fail(`Built-in declaration is missing or misattributed: ${symbolId}`);
      const sourceFile = sourceFilesByPath.get(declaration.sourcePath);
      if (!sourceFile?.gitBlobSha1 || !sourceFile?.contentSha256) fail(`Built-in source blob proof is missing: ${declaration.sourcePath}`);
      entries.push({
        symbolId,
        sourcePath: declaration.sourcePath,
        signature: declaration.signature,
        sourceSpan: { startLine: declaration.startLine, endLine: declaration.endLine },
        sourceGitBlobSha1: sourceFile.gitBlobSha1,
        sourceContentSha256: sourceFile.contentSha256,
        classification: 'required',
        rationale: `This declaration belongs to the pinned Dynmap built-in renderer ${renderer.class}; its class registration/dispatch route is ${renderer.registrationEvidenceIds.join(', ')} and its exact behavior/proof cases are enumerated in ${renderer.phaseDocument}.`,
        dependencyEdgeIds: sortedUnique(edgesBySource.get(symbolId) ?? []),
        dependencyEdgeCoverage: 'resolved-pinned-source-candidates-only; external, lexical, reflection, and resource edges remain open',
        rustDestination: renderer.rustModule,
        ownerPhaseId: renderer.phaseId,
        ownerPhaseDocument: renderer.phaseDocument,
        fixturePlanIds: renderer.fixturePlanIds,
        referencePlanIds: renderer.referencePlanIds,
        focusedTestPlanIds: renderer.focusedTestPlanIds,
        evidencePlanIds: renderer.evidencePlanIds,
        implementationStatus: 'unverified',
      });
    }
  }

  return {
    schemaVersion: 1,
    sourceRepository: 'https://github.com/webbukkit/dynmap',
    sourceRevision: PINNED_REVISION,
    sourceTreeSha1: PINNED_TREE,
    generatedBy: 'spec/map/plan/tools/materialize-builtin-source-dispositions.mjs',
    status: 'partial_builtin_declarations_only_closure_open',
    counts: {
      expectedDeclarations: astInventory.declarations.length,
      dispositionedDeclarations: entries.length,
      undispositionedDeclarations: astInventory.declarations.length - entries.length,
    },
    entries: entries.sort((left, right) => left.symbolId.localeCompare(right.symbolId)),
  };
}

async function run() {
  const [astInventory, builtinCatalog, dependencyCandidates] = await Promise.all([
    readGzipJson('spec/map/coverage/java-ast-inventory.json.gz'),
    readJson('spec/map/coverage/builtin-renderers.json'),
    readGzipJson('spec/map/coverage/source-dependency-candidates.json.gz'),
  ]);
  const ledger = materializeBuiltinSourceDispositions({ astInventory, builtinCatalog, dependencyCandidates });
  await writeFile(resolve(coverageRoot, 'source-symbol-dispositions.json'), `${JSON.stringify(ledger, null, 2)}\n`);
  console.log(`Wrote ${ledger.counts.dispositionedDeclarations} built-in source declarations; ${ledger.counts.undispositionedDeclarations} declarations remain undispositioned and closure remains open.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
