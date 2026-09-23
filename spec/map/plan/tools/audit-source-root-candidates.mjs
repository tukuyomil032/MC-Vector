#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

const PINNED_REVISION = '93b454efb8802dc7406d6873434f2aeec5c636f4';
const PINNED_TREE = '632ec26b9f995c8c7acaf525325b359a8a996175';
const RENDERER_ROOTS = [
  'method:type:org.dynmap.hdmap.HDMapTile#render(MapChunkCache,String)',
  'method:type:org.dynmap.hdmap.HDPerspective#render(MapChunkCache,HDMapTile,String)',
  'method:type:org.dynmap.hdmap.IsoHDPerspective#render(MapChunkCache,HDMapTile,String)',
  'method:type:org.dynmap.hdmap.HDMapManager#loadHDPerspectives(DynmapCore)',
  'method:type:org.dynmap.hdmap.HDMapManager#loadHDShaders(DynmapCore)',
  'method:type:org.dynmap.hdmap.HDMapManager#loadHDLightings(DynmapCore)',
  'method:type:org.dynmap.ConfigurationNode#createInstance(Class%3c%3f%3e%5b%5d,Object%5b%5d)',
  'method:type:org.dynmap.ConfigurationNode#createInstances(String,Class%3c%3f%3e%5b%5d,Object%5b%5d)',
  'method:type:org.dynmap.hdmap.HDBlockModels#loadModels(DynmapCore,ConfigurationNode)',
  'method:type:org.dynmap.hdmap.TexturePack#loadTextureMapping(DynmapCore,ConfigurationNode)',
];
const ROOT_REVIEW_EXAMPLES = [
  'type:org.dynmap.MapManager',
  'type:org.dynmap.storage.MapStorage',
  'type:org.dynmap.markers.impl.MarkerAPIImpl',
];

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '../../../../');
const astPath = resolve(repositoryRoot, 'spec/map/coverage/java-ast-inventory.json.gz');
const dependencyPath = resolve(repositoryRoot, 'spec/map/coverage/source-dependency-candidates.json.gz');
const sourceMapPath = resolve(repositoryRoot, 'spec/map/plan/coverage/source-phase-map.json');
const outputPath = resolve(repositoryRoot, 'spec/map/coverage/source-root-candidate-audit.json.gz');

const fail = (message) => { throw new Error(message); };
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const loadGzipJson = async (path) => JSON.parse(gunzipSync(await readFile(path)).toString('utf8'));

export function createSourceRootCandidateAudit({ ast, dependencies, sourcePhaseMap, rendererRoots = RENDERER_ROOTS, reviewExamples = ROOT_REVIEW_EXAMPLES }) {
  if (ast?.sourceRevision !== PINNED_REVISION || dependencies?.sourceRevision !== PINNED_REVISION
      || sourcePhaseMap?.revision !== PINNED_REVISION) fail('source-root audit inputs do not share the pinned revision');
  if (ast?.sourceTreeSha1 !== PINNED_TREE || dependencies?.sourceTreeSha1 !== PINNED_TREE) fail('source-root audit inputs do not share the pinned Git tree');
  if (ast?.semanticDependencyClosureComplete !== false || dependencies?.closureComplete !== false) {
    fail('candidate source-root audit must not accept a claimed closed semantic graph');
  }
  if (dependencies?.inputDigests?.astInventorySha256 !== sha256(Buffer.from(JSON.stringify(ast)))) {
    fail('dependency candidate graph is not bound to the supplied AST inventory');
  }

  const declarations = ast.declarations;
  const declarationsById = new Map(declarations.map((entry) => [entry.symbolId, entry]));
  if (declarationsById.size !== declarations.length) fail('AST inventory has duplicate declaration IDs');
  const sourcePaths = new Set(sourcePhaseMap.entries.map((entry) => entry.sourcePath));
  if (sourcePaths.size !== sourcePhaseMap.entries.length) fail('candidate source map has duplicate paths');
  const unknownSourcePaths = [...sourcePaths].filter((path) => !ast.sourceFiles.some((entry) => entry.sourcePath === path));
  if (unknownSourcePaths.length) fail(`candidate source map contains ${unknownSourcePaths.length} paths absent from the AST`);

  const missingRoots = rendererRoots.filter((symbolId) => !declarationsById.has(symbolId));
  if (missingRoots.length) fail(`renderer dispatch roots are absent from AST inventory: ${missingRoots.join(', ')}`);
  const missingReviewExamples = reviewExamples.filter((symbolId) => !declarationsById.has(symbolId));
  if (missingReviewExamples.length) fail(`review examples are absent from AST inventory: ${missingReviewExamples.join(', ')}`);

  // This deliberately reproduces the old over-inclusive experiment: every
  // declaration in each candidate file is a seed, not a renderer entry point.
  const seeds = new Set(declarations.filter((entry) => sourcePaths.has(entry.sourcePath)).map((entry) => entry.symbolId));
  const allAdjacency = new Map();
  const callAdjacency = new Map();
  const nonCallEdgesBySource = new Map();
  const validEdges = [];
  const callEdgeKinds = new Set(['method_call', 'constructor_call']);
  for (const edge of dependencies.edges) {
    if (!edge.targetSymbolId || !declarationsById.has(edge.sourceSymbolId) || !declarationsById.has(edge.targetSymbolId)) continue;
    validEdges.push(edge);
    const targets = allAdjacency.get(edge.sourceSymbolId) ?? [];
    targets.push(edge.targetSymbolId);
    allAdjacency.set(edge.sourceSymbolId, targets);
    if (callEdgeKinds.has(edge.kind)) {
      const callTargets = callAdjacency.get(edge.sourceSymbolId) ?? [];
      callTargets.push(edge.targetSymbolId);
      callAdjacency.set(edge.sourceSymbolId, callTargets);
    } else {
      const nonCallEdges = nonCallEdgesBySource.get(edge.sourceSymbolId) ?? [];
      nonCallEdges.push(edge);
      nonCallEdgesBySource.set(edge.sourceSymbolId, nonCallEdges);
    }
  }
  const traverse = (initialSeeds, adjacency) => {
    const visited = new Set(initialSeeds);
    const queue = [...initialSeeds];
    for (let index = 0; index < queue.length; index++) {
      for (const target of adjacency.get(queue[index]) ?? []) {
        if (visited.has(target)) continue;
        visited.add(target);
        queue.push(target);
      }
    }
    return visited;
  };
  const reachable = traverse(seeds, allAdjacency);
  const rendererRootReachable = traverse(rendererRoots, callAdjacency);
  const directNonCallReferences = [...rendererRootReachable]
    .flatMap((sourceSymbolId) => (nonCallEdgesBySource.get(sourceSymbolId) ?? []).map((edge) => ({
      edgeId: edge.edgeId,
      sourceSymbolId,
      targetSymbolId: edge.targetSymbolId,
      kind: edge.kind,
      sourcePath: edge.sourcePath,
      line: edge.line,
    })))
    .sort((left, right) => left.sourcePath.localeCompare(right.sourcePath) || left.line - right.line || left.edgeId.localeCompare(right.edgeId));

  const summarizeFiles = (symbolIds) => {
    const reachedByFile = new Map();
    for (const symbolId of symbolIds) {
      const declaration = declarationsById.get(symbolId);
      const row = reachedByFile.get(declaration.sourcePath) ?? { candidateSeedFile: sourcePaths.has(declaration.sourcePath), reachableDeclarationCount: 0 };
      row.reachableDeclarationCount++;
      reachedByFile.set(declaration.sourcePath, row);
    }
    return reachedByFile;
  };
  const reachedByFile = summarizeFiles(reachable);
  const rendererRootFiles = summarizeFiles(rendererRootReachable);
  const callEdgesTraversed = validEdges.filter((edge) => callEdgeKinds.has(edge.kind)
    && rendererRootReachable.has(edge.sourceSymbolId) && rendererRootReachable.has(edge.targetSymbolId)).length;
  const reviewExamplesReached = reviewExamples.map((symbolId) => ({
    symbolId,
    sourcePath: declarationsById.get(symbolId).sourcePath,
    reachedFromFileSeed: reachable.has(symbolId),
    reachedFromCallGraph: rendererRootReachable.has(symbolId),
    reachedByDirectNonCallReference: directNonCallReferences.some((edge) => edge.targetSymbolId === symbolId),
  }));
  if (reviewExamplesReached.some((entry) => !entry.reachedFromFileSeed)) {
    fail('one or more non-renderer review examples are no longer reached by the candidate-file seed');
  }

  return {
    schemaVersion: 1,
    sourceRevision: PINNED_REVISION,
    sourceTreeSha1: PINNED_TREE,
    status: 'open_overinclusive_file_seed_not_renderer_closure',
    inputDigests: {
      astInventorySha256: sha256(Buffer.from(JSON.stringify(ast))),
      dependencyCandidateInventorySha256: sha256(Buffer.from(JSON.stringify(dependencies))),
      sourcePhaseMapSha256: sha256(Buffer.from(JSON.stringify(sourcePhaseMap))),
    },
    algorithm: {
      seedPolicy: 'all-declarations-in-the-106-file-candidate-map',
      traversedEdges: 'all candidate edges with an AST source and target declaration ID',
      omittedEvidence: ['lexical bindings', 'dynamic strings', 'unresolved imports', 'manual super dispatch', 'external classpath behavior', 'configuration/reflection registration not represented as a pinned edge'],
      interpretation: 'over-inclusive source exploration only; not a required/excluded disposition and not a renderer dependency closure',
    },
    rendererDispatchRoots: rendererRoots.map((symbolId) => {
      const entry = declarationsById.get(symbolId);
      return { symbolId, sourcePath: entry.sourcePath, startLine: entry.startLine, endLine: entry.endLine };
    }),
    rendererRootReachability: {
      status: 'open_candidate_call_graph_only',
      traversedEdges: 'method_call and constructor_call candidate edges with AST source and target declaration IDs only',
      omittedEvidence: ['virtual and interface dispatch expansion', 'reflection/configuration registration closure', 'lexical bindings', 'external library implementations', 'dynamic string/resource lookup', 'manual super/this dispatch'],
      interpretation: 'call-only reachability diagnostic; direct identifier/member_select data references are reported separately and are never recursively traversed; this is not a required/excluded disposition or a closed renderer dependency graph',
      directNonCallReferences,
      reachableFiles: [...rendererRootFiles.entries()]
        .map(([sourcePath, entry]) => ({ sourcePath, ...entry }))
        .sort((left, right) => left.sourcePath.localeCompare(right.sourcePath)),
      reachableSymbolIds: [...rendererRootReachable].sort(),
    },
    counts: {
      astFiles: ast.counts.sourceFiles,
      astDeclarations: declarations.length,
      candidateSourceFiles: sourcePaths.size,
      fileSeedDeclarations: seeds.size,
      traversedPinnedEdges: dependencies.counts.resolvedPinnedDeclarationEdges,
      validCandidateEdges: validEdges.length,
      reachableDeclarations: reachable.size,
      reachableFiles: reachedByFile.size,
      reachableFilesOutsideCandidateMap: [...reachedByFile.values()].filter((entry) => !entry.candidateSeedFile).length,
      declarationsNotReachedByFileSeed: declarations.length - reachable.size,
      rendererRootCandidateDeclarations: rendererRootReachable.size,
      rendererRootCandidateFiles: rendererRootFiles.size,
      rendererRootCandidateFilesOutsideLegacyMap: [...rendererRootFiles.values()].filter((entry) => !entry.candidateSeedFile).length,
      declarationsNotReachedByRendererRootCallEdges: declarations.length - rendererRootReachable.size,
      rendererRootCallEdgesTraversed: callEdgesTraversed,
      rendererRootDirectNonCallReferenceEdges: directNonCallReferences.length,
      rendererRootDirectNonCallTargetDeclarations: new Set(directNonCallReferences.map((edge) => edge.targetSymbolId)).size,
    },
    reachableFileSummaries: [...reachedByFile.entries()]
      .map(([sourcePath, entry]) => ({ sourcePath, ...entry }))
      .sort((left, right) => left.sourcePath.localeCompare(right.sourcePath)),
    reviewExamplesReached,
    reachableSymbolIds: [...reachable].sort(),
  };
}

async function run() {
  const mode = process.argv[2];
  if (mode !== '--write' && mode !== '--check') fail('Pass exactly one of --write or --check');
  const ast = await loadGzipJson(astPath);
  const dependencies = await loadGzipJson(dependencyPath);
  const sourcePhaseMap = JSON.parse(await readFile(sourceMapPath, 'utf8'));
  const audit = createSourceRootCandidateAudit({ ast, dependencies, sourcePhaseMap });
  const expected = gzipSync(Buffer.from(`${JSON.stringify(audit)}\n`), { level: 9, mtime: 0 });
  if (mode === '--write') {
    await writeFile(outputPath, expected);
  } else {
    const actual = await readFile(outputPath).catch(() => null);
    if (!actual?.equals(expected)) fail('source-root candidate audit is missing or stale');
  }
  console.log(JSON.stringify({ ...audit.counts, status: audit.status }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
