#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const scriptDir = resolve(fileURLToPath(new URL('.', import.meta.url)));
const planRoot = resolve(scriptDir, '..');
const repoRoot = resolve(planRoot, '../../..');
const pinnedRevision = '93b454efb8802dc7406d6873434f2aeec5c636f4';
const stageFiles = ['assets.md', 'anvil.md', 'paper-snapshot.md', 'reference-and-parity.md', 'real-acceptance.md'];
const failures = [];
const requireValue = (condition, message) => { if (!condition) failures.push(message); };
const readJson = async (path) => JSON.parse(await readFile(resolve(repoRoot, path), 'utf8'));
const readGzipJson = async (path) => JSON.parse(gunzipSync(await readFile(resolve(repoRoot, path))).toString('utf8'));
const exists = async (path) => readFile(resolve(planRoot, path)).then(() => true, () => false);

const [ast, resourceInventory, dependencyCandidates, sourceMap, resources, builtins, versions, versionDeltas, phaseGraph] = await Promise.all([
  readGzipJson('spec/map/coverage/java-ast-inventory.json.gz'),
  readGzipJson('spec/map/coverage/pinned-resource-inventory.json.gz'),
  readGzipJson('spec/map/coverage/source-dependency-candidates.json.gz'),
  readJson('spec/map/plan/coverage/source-phase-map.json'),
  readJson('spec/map/coverage/resources.json'),
  readJson('spec/map/coverage/builtin-renderers.json'),
  readJson('spec/map/coverage/version-matrix.json'),
  readJson('spec/map/coverage/version-delta-matrix.json'),
  readJson('spec/map/plan/coverage/phase-graph.json'),
]);

const phaseByDocument = new Map((phaseGraph.nodes ?? []).map((node) => [node.document, node.id]));
const astPaths = new Set((ast.sourceFiles ?? []).map((entry) => entry.sourcePath));
const inventoryPathMap = new Map((resourceInventory.entries ?? []).map((entry) => [entry.sourcePath, entry]));
const resourceRows = new Map((resources.entries ?? []).map((entry) => [entry.sourcePath, entry]));
const sourceOwnerByPath = new Map((sourceMap.entries ?? []).map((entry) => [entry.sourcePath, entry.candidateOwnerDocument]));
const sourceDocuments = new Set([...sourceOwnerByPath.values()]);
const resourceDocuments = new Set((resources.entries ?? []).map((entry) => entry.phaseDocument));
const allJavaDeclarationCount = ast.declarations?.length ?? 0;
const mappedSourceFileCount = [...sourceOwnerByPath.keys()].filter((path) => astPaths.has(path)).length;
const discoverySourceFileCount = Math.max(0, astPaths.size - mappedSourceFileCount);

requireValue(ast.sourceRevision === pinnedRevision && resourceInventory.sourceRevision === pinnedRevision, 'inventories are not both bound to the pinned Dynmap revision');
requireValue(ast.sourceTreeSha1 === resourceInventory.sourceTreeSha1, 'AST and resource inventories identify different pinned Git trees');
requireValue(ast.counts?.sourceFiles === ast.sourceFiles?.length && ast.counts?.parsedFiles === ast.sourceFiles?.length, 'AST source file counts disagree or parsed files are missing');
requireValue(ast.counts?.declarations === allJavaDeclarationCount && ast.counts?.parseErrors === 0, 'AST declarations are incomplete or parse errors remain');
requireValue(new Set((ast.declarations ?? []).map((entry) => entry.symbolId)).size === allJavaDeclarationCount, 'AST declarations contain duplicate or missing stable IDs');
requireValue(sourceMap.revision === pinnedRevision && sourceMap.entries?.length > 0, 'source candidate-to-phase map is missing or uses another revision');
requireValue(mappedSourceFileCount === sourceMap.entries.length, 'a source candidate map entry does not match a path in the full AST inventory');

const p000Document = 'phases/phase-000-source-ast-closure.md';
const p001Document = 'phases/phase-001-resource-closure.md';
requireValue(phaseByDocument.has(p000Document), 'P-000 source closure phase is not in the phase graph');
requireValue(phaseByDocument.has(p001Document), 'P-001 resource closure phase is not in the phase graph');
for (const [sourcePath, document] of sourceOwnerByPath) {
  requireValue(astPaths.has(sourcePath), `source candidate has no AST source file: ${sourcePath}`);
  requireValue(phaseByDocument.has(document), `source candidate owner phase does not exist: ${sourcePath}`);
}
for (const declaration of ast.declarations ?? []) {
  const ownerDocument = sourceOwnerByPath.get(declaration.sourcePath) ?? p000Document;
  requireValue(phaseByDocument.has(ownerDocument), `source declaration has no planned owner: ${declaration.symbolId}`);
}

requireValue(dependencyCandidates.sourceRevision === pinnedRevision, 'dependency candidate inventory uses another source revision');
requireValue(dependencyCandidates.counts?.declarations === allJavaDeclarationCount, 'dependency candidate declaration count differs from the AST inventory');
requireValue(dependencyCandidates.counts?.syntaxReferenceCandidates === ast.counts?.referenceCandidates, 'dependency candidate reference count differs from the AST inventory');
requireValue(dependencyCandidates.counts?.javacParseDiagnostics === 0, 'dependency candidate parser reports javac parse errors');
requireValue(phaseByDocument.has(p000Document), 'open semantic/dynamic dependency review has no P-000 owner');

const inventoryPaths = new Set(inventoryPathMap.keys());
const catalogPaths = new Set(resourceRows.keys());
requireValue(resources.sourceRevision === pinnedRevision && resourceInventory.sourceRevision === pinnedRevision, 'resource inventory/catalog uses another source revision');
requireValue(inventoryPaths.size === resourceInventory.counts?.resources, 'pinned resource path count disagrees with its inventory');
requireValue(inventoryPaths.size === catalogPaths.size && [...inventoryPaths].every((path) => catalogPaths.has(path)), 'resource plan catalog does not cover the exact pinned resource path set');
for (const path of inventoryPaths) {
  const row = resourceRows.get(path);
  const plannedDocument = row?.phaseDocument ?? p001Document;
  requireValue(Boolean(row), `resource path has no plan row: ${path}`);
  requireValue(phaseByDocument.has(plannedDocument), `resource plan owner does not exist: ${path}`);
}
requireValue(resourceDocuments.size > 0 && (resourceDocuments.has(p001Document) || phaseByDocument.has(p001Document)), 'open resource classification has no P-001 plan owner');

requireValue(builtins.sourceRevision === pinnedRevision && builtins.entries?.length > 0, 'built-in plan seed is missing or uses another revision');
for (const entry of builtins.entries ?? []) {
  requireValue(phaseByDocument.get(entry.phaseDocument) === entry.phaseId, `built-in plan page is not owned by the phase graph: ${entry.class}`);
}
requireValue(versionDeltas.entries?.length === versions.entries?.length, 'version delta plan rows do not cover the exact version matrix');
requireValue(new Set((versionDeltas.entries ?? []).map((entry) => entry.minecraftVersion)).size === versions.entries?.length, 'version delta plan has duplicate or missing exact releases');
for (const entry of versions.entries ?? []) {
  for (const file of stageFiles) {
    requireValue(await exists(`phases/versions/${entry.minecraftVersion}/${file}`), `version phase page is missing: ${entry.minecraftVersion}/${file}`);
  }
}

const totalVersionPages = (versions.entries?.length ?? 0) * stageFiles.length;
if (failures.length > 0) {
  console.error(`Plan coverage failed (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(`Plan coverage passed: ${allJavaDeclarationCount.toLocaleString('en-US')} AST declarations assigned to ${sourceMap.entries.length} candidate source maps or P-000 closure review (${mappedSourceFileCount} mapped files, ${discoverySourceFileCount} discovery files); ${dependencyCandidates.counts.syntaxReferenceCandidates.toLocaleString('en-US')} reference candidates assigned to P-000; ${inventoryPaths.size.toLocaleString('en-US')} resource paths assigned to P-001/family owners; ${builtins.entries.length} built-ins; ${totalVersionPages} exact-version pages. Implementation/source/resource closure remains open and is not claimed complete.`);
}
