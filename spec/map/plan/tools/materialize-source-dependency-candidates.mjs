#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';

const PINNED_REVISION = '93b454efb8802dc7406d6873434f2aeec5c636f4';
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '../../../../');
const coverageRoot = resolve(repositoryRoot, 'spec/map/coverage');
const defaultAst = resolve(coverageRoot, 'java-ast-inventory.json.gz');
const defaultSemantic = resolve(coverageRoot, 'java-semantic-references.json.gz');
const defaultOutput = resolve(coverageRoot, 'source-dependency-candidates.json.gz');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = (message) => { throw new Error(message); };

const astKinds = {
  method_call: 'method_call_candidate',
  constructor_call: 'constructor_call_candidate',
  member_select: 'member_select_candidate',
  identifier: 'identifier_candidate',
  string_literal: 'string_literal_candidate',
};

const locationKey = (sourcePath, startOffset, endOffset, kind) =>
  `${sourcePath}\0${startOffset}\0${kind}`;
const sourceStartKey = (sourcePath, startOffset) => `${sourcePath}\0${startOffset}`;
const declarationKey = (sourcePath, startOffset, endOffset) =>
  `${sourcePath}\0${startOffset}\0${endOffset}`;
const stableId = (prefix, value) => `${prefix}-${sha256(Buffer.from(value, 'utf8'))}`;
const LEXICAL_BINDING_KINDS = new Set([
  'local_variable',
  'parameter',
  'exception_parameter',
  'resource_variable',
  'type_parameter',
]);

export function materializeSourceDependencyCandidates(ast, semantic) {
  if (ast?.sourceRevision !== PINNED_REVISION || semantic?.sourceRevision !== PINNED_REVISION) {
    fail('Source inventories do not match the pinned Dynmap revision');
  }
  if (ast.sourceTreeSha1 !== '632ec26b9f995c8c7acaf525325b359a8a996175') {
    fail('AST inventory is not bound to the expected pinned Git tree');
  }
  if (semantic.status !== 'attribution_inventory_only_closure_open' || semantic.closureComplete !== false) {
    fail('Semantic inventory must preserve its open-closure status');
  }

  const declarationsByLocation = new Map();
  const declarationsByStart = new Map();
  const declarationsById = new Map();
  const declarationsByFile = new Map();
  for (const declaration of ast.declarations ?? []) {
    if (!Number.isSafeInteger(declaration.startOffset) || !Number.isSafeInteger(declaration.endOffset)
        || declaration.startOffset < 0 || declaration.endOffset < declaration.startOffset) {
      fail(`AST declaration lacks exact source offsets: ${declaration.symbolId}`);
    }
    const key = declarationKey(declaration.sourcePath, declaration.startOffset, declaration.endOffset);
    if (declarationsByLocation.has(key)) fail(`Duplicate declaration source span: ${declaration.symbolId}`);
    if (declarationsById.has(declaration.symbolId)) fail(`Duplicate declaration ID: ${declaration.symbolId}`);
    declarationsByLocation.set(key, declaration);
    declarationsById.set(declaration.symbolId, declaration);
    const declarationsInFile = declarationsByFile.get(declaration.sourcePath) ?? [];
    declarationsInFile.push(declaration);
    declarationsByFile.set(declaration.sourcePath, declarationsInFile);
    const startKey = sourceStartKey(declaration.sourcePath, declaration.startOffset);
    const rowsAtStart = declarationsByStart.get(startKey) ?? [];
    rowsAtStart.push(declaration);
    declarationsByStart.set(startKey, rowsAtStart);
  }
  for (const rows of declarationsByFile.values()) rows.sort((left, right) => {
    const leftWidth = left.endOffset - left.startOffset;
    const rightWidth = right.endOffset - right.startOffset;
    return leftWidth - rightWidth || left.startOffset - right.startOffset;
  });
  const inferSourceOwner = (reference) => {
    if (Number.isSafeInteger(reference.contextMethodStartOffset)
        && Number.isSafeInteger(reference.contextMethodEndOffset)
        && reference.contextMethodStartOffset >= 0 && reference.contextMethodEndOffset >= reference.contextMethodStartOffset) {
      const method = declarationsByLocation.get(declarationKey(
        reference.sourcePath,
        reference.contextMethodStartOffset,
        reference.contextMethodEndOffset,
      ));
      if (method && ['method', 'constructor'].includes(method.kind)) return method;
    }
    if (reference.contextTypeBinaryName) {
      const type = declarationsById.get(`type:${reference.contextTypeBinaryName}`);
      if (type?.sourcePath === reference.sourcePath) return type;
    }
    if (Number.isSafeInteger(reference.contextTypeStartOffset)
        && Number.isSafeInteger(reference.contextTypeEndOffset)
        && reference.contextTypeStartOffset >= 0 && reference.contextTypeEndOffset >= reference.contextTypeStartOffset) {
      const type = declarationsByLocation.get(declarationKey(
        reference.sourcePath,
        reference.contextTypeStartOffset,
        reference.contextTypeEndOffset,
      ));
      if (type && ['class', 'interface', 'enum', 'annotation_type', 'record'].includes(type.kind)) return type;
    }
    const candidates = declarationsByFile.get(reference.sourcePath) ?? [];
    const typesAtStart = candidates.filter((declaration) => ['class', 'interface', 'enum', 'annotation_type', 'record'].includes(declaration.kind)
      && declaration.startOffset === reference.contextTypeStartOffset);
    return typesAtStart.length === 1 ? typesAtStart[0] : null;
  };

  const astCandidatesByLocation = new Map();
  for (const candidate of ast.referenceCandidates ?? []) {
    if (!Number.isSafeInteger(candidate.startOffset) || !Number.isSafeInteger(candidate.endOffset)
        || candidate.startOffset < 0 || (candidate.endOffset >= 0 && candidate.endOffset < candidate.startOffset)) {
      fail(`AST reference candidate lacks exact source offsets: ${candidate.sourcePath}:${candidate.line}`);
    }
    const kind = Object.entries(astKinds).find(([, value]) => value === candidate.kind)?.[0];
    if (!kind) fail(`Unknown AST candidate kind: ${candidate.kind}`);
    const key = locationKey(candidate.sourcePath, candidate.startOffset, candidate.endOffset, kind);
    const rows = astCandidatesByLocation.get(key) ?? [];
    rows.push(candidate);
    astCandidatesByLocation.set(key, rows);
  }

  const edges = [];
  const fileReferences = [];
  const unresolved = [];
  const unmatchedSemanticReferences = [];
  const manualReview = [];
  const manualDispatchReview = [];
  const importResolutionCandidates = [];
  const externalGroups = new Map();
  const lexicalBindingGroups = new Map();
  const usedAstCandidates = new Set();
  const semanticOccurrences = new Map();
  let matchedSemanticReferenceCount = 0;
  let unmatchedSemanticReferenceCount = 0;

  for (const reference of semantic.references ?? []) {
    const semanticKind = reference.kind;
    const key = locationKey(reference.sourcePath, reference.startOffset, reference.endOffset, semanticKind);
    const candidates = astCandidatesByLocation.get(key) ?? [];
    const candidate = candidates.find((entry) => !usedAstCandidates.has(entry));
    const semanticOccurrence = semanticOccurrences.get(key) ?? 0;
    semanticOccurrences.set(key, semanticOccurrence + 1);
    const referenceId = stableId('REF', `${key}\0${semanticOccurrence}`);
    if (candidate) {
      usedAstCandidates.add(candidate);
      matchedSemanticReferenceCount++;
    } else {
      unmatchedSemanticReferenceCount++;
    }

    const sourceSymbolId = candidate?.contextSymbolId || inferSourceOwner(reference)?.symbolId || null;
    if (!candidate) {
      unmatchedSemanticReferences.push({
        referenceId,
        ...reference,
        sourceSymbolId,
        reason: 'semantic_reference_not_represented_in_syntax_inventory',
      });
    }
    if (semanticKind === 'string_literal') {
      manualReview.push({
        referenceId,
        sourcePath: reference.sourcePath,
        line: reference.line,
        sourceSymbolId,
        contextType: reference.contextType,
        contextMethod: reference.contextMethod,
        literal: reference.literal,
        enclosingCalls: reference.enclosingCalls ?? [],
        reviewStatus: 'reflection-resource-config-and-dynamic-dispatch-review-required',
      });
      continue;
    }

    if (reference.resolution === 'resolved_pinned_source_declaration') {
      if (LEXICAL_BINDING_KINDS.has(reference.targetKind)) {
        const groupKey = `${sourceSymbolId ?? 'file-level'}\0${reference.targetKind}\0${reference.targetSignature ?? ''}`;
        const group = lexicalBindingGroups.get(groupKey) ?? {
          sourceSymbolId,
          targetKind: reference.targetKind,
          targetName: reference.targetSignature ?? '',
          count: 0,
          sampleLocations: [],
        };
        group.count++;
        if (group.sampleLocations.length < 3) group.sampleLocations.push({ sourcePath: reference.sourcePath, line: reference.line });
        lexicalBindingGroups.set(groupKey, group);
        continue;
      }
      const exactTargetKey = declarationKey(
        reference.targetSourcePath,
        reference.targetStartOffset,
        reference.targetEndOffset,
      );
      const candidatesAtStart = declarationsByStart.get(sourceStartKey(reference.targetSourcePath, reference.targetStartOffset)) ?? [];
      const target = declarationsByLocation.get(exactTargetKey)
        ?? (candidatesAtStart.length === 1 ? candidatesAtStart[0] : null);
      if (!target) {
        const implicitConstructorOwner = reference.targetKind === 'constructor'
          && (!Number.isSafeInteger(reference.targetEndOffset) || reference.targetEndOffset < 0)
          && reference.targetOwnerBinaryName
          ? declarationsById.get(`type:${reference.targetOwnerBinaryName}`)
          : null;
        if (implicitConstructorOwner && sourceSymbolId) {
          edges.push({
            edgeId: stableId('EDGE', `${sourceSymbolId}\0${referenceId}\0${implicitConstructorOwner.symbolId}`),
            sourceSymbolId,
            targetSymbolId: implicitConstructorOwner.symbolId,
            sourcePath: reference.sourcePath,
            line: reference.line,
            kind: semanticKind,
            targetSourcePath: implicitConstructorOwner.sourcePath,
            targetSignature: implicitConstructorOwner.signature,
            semanticTargetKind: 'implicit_constructor_owned_by_type',
            resolution: 'resolved_to_source_type_constructor_owner',
          });
        } else {
          unresolved.push({
            referenceId,
            sourcePath: reference.sourcePath,
            line: reference.line,
            sourceSymbolId,
            kind: semanticKind,
            reason: 'pinned-target-source-span-not-present-in-ast-declarations',
            targetKind: reference.targetKind,
            targetSignature: reference.targetSignature,
            targetSourcePath: reference.targetSourcePath,
            targetStartLine: reference.targetStartLine,
            targetStartOffset: reference.targetStartOffset,
            targetEndOffset: reference.targetEndOffset,
            targetOwnerBinaryName: reference.targetOwnerBinaryName,
          });
        }
      } else if (!sourceSymbolId) {
        fileReferences.push({
          referenceId,
          sourcePath: reference.sourcePath,
          line: reference.line,
          kind: semanticKind,
          targetSymbolId: target.symbolId,
          targetSourcePath: target.sourcePath,
          targetSignature: target.signature,
          reason: 'source-file-level-reference-without-enclosing-declaration',
        });
      } else {
        edges.push({
          edgeId: stableId('EDGE', `${sourceSymbolId}\0${referenceId}\0${target.symbolId}`),
          sourceSymbolId,
          targetSymbolId: target.symbolId,
          sourcePath: reference.sourcePath,
          line: reference.line,
          kind: semanticKind,
          targetSourcePath: target.sourcePath,
          targetSignature: target.signature,
          resolution: 'resolved_pinned_declaration',
        });
      }
      continue;
    }

    if (reference.resolution === 'external_or_generated_declaration') {
      const key = `${sourceSymbolId ?? 'file-level'}\0${semanticKind}\0${reference.targetKind ?? 'unknown'}\0${reference.targetSignature ?? ''}`;
      const group = externalGroups.get(key) ?? {
        sourceSymbolId,
        kind: semanticKind,
        targetKind: reference.targetKind ?? 'unknown',
        targetSignature: reference.targetSignature ?? '',
        count: 0,
        sampleLocations: [],
      };
      group.count++;
      if (group.sampleLocations.length < 3) group.sampleLocations.push({ sourcePath: reference.sourcePath, line: reference.line });
      externalGroups.set(key, group);
      continue;
    }

    const unresolvedReference = {
      referenceId,
      sourcePath: reference.sourcePath,
      line: reference.line,
      sourceSymbolId,
      kind: semanticKind,
      sourceExpression: reference.sourceExpression,
      reason: reference.resolution,
    };
    if (reference.resolution === 'manual_super_or_this_constructor_resolution_required') {
      manualDispatchReview.push({
        ...unresolvedReference,
        contextType: reference.contextType,
        contextTypeBinaryName: reference.contextTypeBinaryName,
        contextTypeStartOffset: reference.contextTypeStartOffset,
        contextTypeEndOffset: reference.contextTypeEndOffset,
        contextMethod: reference.contextMethod,
        contextMethodStartOffset: reference.contextMethodStartOffset,
        contextMethodEndOffset: reference.contextMethodEndOffset,
        reviewStatus: 'resolve-explicit-or-implicit-superclass-constructor-from-pinned-inheritance',
      });
    } else if (String(sourceSymbolId ?? '').startsWith('import:')) {
      importResolutionCandidates.push({
        ...unresolvedReference,
        importOwner: sourceSymbolId,
        reviewStatus: 'resolve-static-member-or-package-import-against-pinned-types-and-external-classpath',
      });
    } else {
      unresolved.push(unresolvedReference);
    }
  }

  const unmatchedAstCandidates = [];
  for (const rows of astCandidatesByLocation.values()) {
    for (const candidate of rows) {
      if (usedAstCandidates.has(candidate)) continue;
      unmatchedAstCandidates.push({
        referenceId: stableId('REF', locationKey(candidate.sourcePath, candidate.startOffset, candidate.endOffset, candidate.kind)),
        sourcePath: candidate.sourcePath,
        line: candidate.line,
        sourceSymbolId: candidate.contextSymbolId || null,
        kind: candidate.kind,
        target: candidate.target,
        reason: 'syntax_candidate_not_seen_in_semantic_scan',
      });
    }
  }

  edges.sort((left, right) => left.edgeId.localeCompare(right.edgeId));
  const externalReferences = [...externalGroups.entries()].map(([groupKey, value]) => ({
    groupId: stableId('EXT', groupKey),
    ...value,
  })).sort((left, right) => left.groupId.localeCompare(right.groupId));

  const result = {
    schemaVersion: 1,
    sourceRepository: 'https://github.com/webbukkit/dynmap',
    sourceRevision: PINNED_REVISION,
    sourceTreeSha1: ast.sourceTreeSha1,
    parser: semantic.parser,
    compilerVersion: semantic.compilerVersion,
    status: 'open-not-a-complete-renderer-closure',
    closureComplete: false,
    inputDigests: {
      astInventorySha256: sha256(Buffer.from(JSON.stringify(ast))),
      semanticReferenceInventorySha256: sha256(Buffer.from(JSON.stringify(semantic))),
    },
    counts: {
      declarations: ast.counts.declarations,
      syntaxReferenceCandidates: ast.counts.referenceCandidates,
      semanticReferences: semantic.counts.references,
      matchedSemanticReferences: matchedSemanticReferenceCount,
      unmatchedSemanticReferences: unmatchedSemanticReferenceCount,
      resolvedPinnedDeclarationEdges: edges.length,
      lexicalBindingGroups: lexicalBindingGroups.size,
      sourceFileLevelReferences: fileReferences.length,
      unresolvedSemanticReferences: unresolved.length,
      unmatchedSyntaxCandidates: unmatchedAstCandidates.length,
      externalReferenceGroups: externalReferences.length,
      dynamicStringReviewCandidates: manualReview.length,
      importResolutionCandidates: importResolutionCandidates.length,
      manualSuperDispatchReviewCandidates: manualDispatchReview.length,
      javacParseDiagnostics: semantic.counts.parseDiagnostics,
      javacAnalysisDiagnostics: semantic.counts.analysisDiagnostics,
    },
    edges,
    fileReferences,
    externalReferences,
    importResolutionCandidates,
    manualSuperDispatchReviewCandidates: manualDispatchReview,
    unmatchedSemanticReferences,
    lexicalBindings: [...lexicalBindingGroups.entries()].map(([groupKey, value]) => ({
      groupId: stableId('LEX', groupKey),
      ...value,
    })).sort((left, right) => left.groupId.localeCompare(right.groupId)),
    unresolved,
    unmatchedSyntaxCandidates: unmatchedAstCandidates,
    dynamicStringReviewCandidates: manualReview,
  };
  return result;
}

async function loadJson(path) {
  const bytes = await readFile(path);
  return path.endsWith('.gz') ? JSON.parse(gunzipSync(bytes).toString('utf8')) : JSON.parse(bytes.toString('utf8'));
}

function parseArguments(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (!['--ast', '--semantic', '--output', '--write', '--check'].includes(flag)) fail(`Unknown argument: ${flag}`);
    if (flag === '--write' || flag === '--check') {
      if (values.has(flag)) fail(`Duplicate mode: ${flag}`);
      values.set(flag, true);
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) fail(`Missing value for ${flag}`);
    if (values.has(flag)) fail(`Duplicate argument: ${flag}`);
    values.set(flag, value);
    index++;
  }
  if (values.has('--write') === values.has('--check')) fail('Pass exactly one of --write or --check');
  return values;
}

async function run() {
  const args = parseArguments(process.argv.slice(2));
  const astPath = resolve(args.get('--ast') ?? defaultAst);
  const semanticPath = resolve(args.get('--semantic') ?? defaultSemantic);
  const outputPath = resolve(args.get('--output') ?? defaultOutput);
  const result = materializeSourceDependencyCandidates(await loadJson(astPath), await loadJson(semanticPath));
  const bytes = gzipSync(Buffer.from(`${JSON.stringify(result)}\n`, 'utf8'), { level: 9, mtime: 0 });
  if (args.has('--write')) {
    await mkdir(dirname(outputPath), { recursive: true });
    const { writeFile } = await import('node:fs/promises');
    await writeFile(outputPath, bytes);
  } else {
    const current = await readFile(outputPath).catch(() => null);
    if (!current?.equals(bytes)) fail(`Dependency candidate inventory is missing or stale: ${outputPath}`);
  }
  console.log(`Wrote open dependency candidate inventory: ${JSON.stringify(result.counts)}; closureComplete=false.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
