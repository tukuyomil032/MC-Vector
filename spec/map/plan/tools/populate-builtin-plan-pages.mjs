#!/usr/bin/env node

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const scriptDirectory = resolve(import.meta.dirname);
const repositoryRoot = resolve(scriptDirectory, '../../../../');
const coverageRoot = resolve(repositoryRoot, 'spec/map/coverage');
const planRoot = resolve(repositoryRoot, 'spec/map/plan');
const catalogPath = resolve(coverageRoot, 'builtin-renderers.json');
const dispatchPath = resolve(coverageRoot, 'builtin-dispatch-inventory.json');
const behaviorPath = resolve(coverageRoot, 'builtin-behavior-inventory.json.gz');
const astPath = resolve(coverageRoot, 'java-ast-inventory.json.gz');

const fail = (message) => { throw new Error(message); };
const uniqueSorted = (values) => [...new Set(values)].sort();
const markdown = (value) => String(value ?? '—').replaceAll('|', '\\|').replaceAll('\n', '<br>');
const loadJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const loadGzipJson = async (path) => JSON.parse(gunzipSync(await readFile(path)).toString('utf8'));

function renderMatrixSection(entry, dispatchClass, behaviorClass, astDeclarations, dispatcher) {
  const sourceDeclarations = astDeclarations.filter((row) => row.sourcePath === entry.sourcePath);
  const outcomes = [];
  const branchRows = [];
  for (const method of behaviorClass.methods) {
    for (const branch of method.branches) {
      for (const outcome of branch.outcomes) {
        const caseId = `CASE-${branch.branchId}-${outcome.outcomeIdSuffix}`;
        outcomes.push({
          caseId,
          fixtureId: `FIX-${caseId}`,
          referenceId: `REF-${caseId}`,
          testId: `TEST-${caseId}`,
          evidencePlanId: `EVID-${caseId}`,
          branch,
          method,
          outcome,
        });
      }
      branchRows.push({ branch, method });
    }
  }
  const configurationCases = dispatchClass.directDefinitions.map((definition) => ({
    caseId: `CASE-${definition.evidenceId}`,
    fixtureId: `FIX-CASE-${definition.evidenceId}`,
    referenceId: `REF-CASE-${definition.evidenceId}`,
    testId: `TEST-CASE-${definition.evidenceId}`,
    evidencePlanId: `EVID-CASE-${definition.evidenceId}`,
    definition,
  }));
  if (outcomes.length === 0 && configurationCases.length === 0) {
    const caseId = `CASE-${entry.class}-default-output`;
    outcomes.push({
      caseId,
      fixtureId: `FIX-${caseId}`,
      referenceId: `REF-${caseId}`,
      testId: `TEST-${caseId}`,
      evidencePlanId: `EVID-${caseId}`,
      branch: null,
      method: behaviorClass.methods.find((item) => item.signature.includes('#getRenderPatchList(')) ?? behaviorClass.methods[0],
      outcome: { outcomeIdSuffix: 'default', meaning: 'default source-defined renderer result' },
    });
  }

  const registrationRows = [
    '| Registration evidence ID | Dispatch route | Exact evidence |',
    '|---|---|---|',
    `| ${dispatcher.routeId} | reflective custom renderer | \`${dispatcher.classLoaderSymbolId}\` calls \`${dispatcher.classLoaderCall}\` at ${dispatcher.classLoaderSourcePath}:${dispatcher.classLoaderLine}; config parser ${dispatcher.parserSourcePath}:${dispatcher.parserStartLine}-${dispatcher.parserEndLine} |`,
    ...dispatchClass.directDefinitions.map((definition) => `| ${definition.evidenceId} | static customblock registration | ${definition.sourcePath}:${definition.sourceLine} |`),
  ].join('\n');

  const definitionRows = [
    '| Evidence ID | Pinned definition | Guard | Block selector(s) | Legacy data selector(s) | State selector(s) | Custom parameter key(s) |',
    '|---|---|---|---|---|---|---|',
    ...(dispatchClass.directDefinitions.length === 0
      ? ['| none | No static `customblock` record names this class in the pinned `models_<n>.txt` or `renderdata/*.txt` search set. | — | — | — | — | — |']
      : dispatchClass.directDefinitions.map((definition) => `| ${definition.evidenceId} | ${definition.sourcePath}:${definition.sourceLine} | ${markdown(definition.versionGuard)} | ${markdown(definition.blockSelectors.join(', '))} | ${markdown(definition.legacyDataSelectors.join(', '))} | ${markdown(definition.stateSelectors.join(', '))} | ${markdown(definition.parameterKeys.join(', '))} |`)),
  ].join('\n');

  const methodRows = [
    '| AST symbol ID | Exact pinned signature | Source lines | Branch IDs |',
    '|---|---|---:|---|',
    ...behaviorClass.methods.map((method) => {
      const declaration = sourceDeclarations.find((row) => row.symbolId === method.symbolId);
      if (!declaration) fail(`Behavior method symbol is missing from AST source declarations: ${method.symbolId}`);
      return `| ${method.symbolId} | \`${markdown(method.signature)}\` | ${method.sourceSpan.startLine}–${method.sourceSpan.endLine} | ${method.branches.map((branch) => branch.branchId).join(', ') || 'none'} |`;
    }),
  ].join('\n');

  const declarationRows = [
    '| AST symbol ID | Kind | Exact source signature/name | Source lines |',
    '|---|---|---|---:|',
    ...sourceDeclarations.map((declaration) => `| ${declaration.symbolId} | ${declaration.kind} | \`${markdown(declaration.signature)}\` | ${declaration.startLine}–${declaration.endLine} |`),
  ].join('\n');

  const branchTable = [
    '| Branch ID | Exact method / source | Kind | Pinned condition or selector | Required outcomes and per-outcome proof IDs |',
    '|---|---|---|---|---|',
    ...branchRows.map(({ branch, method }) => {
      const outcomeProofs = branch.outcomes.map((outcome) => {
        const caseId = `CASE-${branch.branchId}-${outcome.outcomeIdSuffix}`;
        const labels = Array.isArray(outcome.labels) && outcome.labels.length > 0
          ? `; labels=${markdown(outcome.labels.join(', '))}`
          : '';
        return `${caseId} (${markdown(outcome.meaning)}${labels}; fixture FIX-${caseId}; reference REF-${caseId}; test TEST-${caseId}; evidence plan EVID-${caseId})`;
      }).join('<br>');
      return `| ${branch.branchId} | \`${markdown(method.signature)}\` ${branch.startLine}–${branch.endLine} | ${branch.kind} | \`${markdown(branch.condition)}\` | ${outcomeProofs} |`;
    }),
    ...(branchRows.length === 0 ? ['| none | No conditional/control-flow site exists in this source class; the default-output case below remains mandatory. | — | — | — |'] : []),
  ].join('\n');

  const configCaseTable = configurationCases.length === 0
    ? 'No pinned static configuration case exists for this class. The dynamic-definition fixture must supply one explicit valid `customblock` row and one malformed row; values must be derived from this class\'s constructor and initializer source, not guessed.'
    : [
      '| Case ID | Fixture | Reference | Focused test | Evidence plan | Exact source-backed input |',
      '|---|---|---|---|---|',
      ...configurationCases.map(({ caseId, fixtureId, referenceId, testId, evidencePlanId, definition }) => `| ${caseId} | ${fixtureId} | ${referenceId} | ${testId} | ${evidencePlanId} | ${definition.sourcePath}:${definition.sourceLine}; guard=${markdown(definition.versionGuard)}; block=${markdown(definition.blockSelectors.join(', '))}; data=${markdown(definition.legacyDataSelectors.join(', '))}; state=${markdown(definition.stateSelectors.join(', '))}; parameter keys=${markdown(definition.parameterKeys.join(', '))} |`),
    ].join('\n');

  const standaloneCases = outcomes.filter((item) => item.branch === null);
  const standaloneCaseTable = standaloneCases.length === 0
    ? null
    : [
      '| Case ID | Fixture | Reference | Focused test | Evidence plan | Source-defined result |',
      '|---|---|---|---|---|',
      ...standaloneCases.map((item) => `| ${item.caseId} | ${item.fixtureId} | ${item.referenceId} | ${item.testId} | ${item.evidencePlanId} | \`${markdown(item.method.signature)}\`; ${markdown(item.outcome.meaning)} |`),
    ].join('\n');

  return [
    '## Class-specific state and branch matrix',
    '',
    `Pinned behavior inventory: [builtin-behavior-inventory.json.gz](../../../coverage/builtin-behavior-inventory.json.gz); dispatch inventory: [builtin-dispatch-inventory.json](../../../coverage/builtin-dispatch-inventory.json). These generated records are pinned to \`${entry.sourceRevision}\`; line ranges and symbol IDs are checked against the javac AST and Git blob IDs.`,
    '',
    '### Dispatch and exact configured input cases',
    '',
    `The configuration parser is \`${dispatcher.parserSignature}\` at \`${dispatcher.parserSourcePath}:${dispatcher.parserStartLine}-${dispatcher.parserEndLine}\`. The reflective class load is \`${dispatcher.classLoaderCall}\` at \`${dispatcher.classLoaderSourcePath}:${dispatcher.classLoaderLine}\` from \`${dispatcher.classLoaderSymbolId}\`. Every \`customblock:class\` selector resolves through this path; classes with no pinned static record are not treated as unreachable.`,
    '',
    registrationRows,
    '',
    definitionRows,
    '',
    'Each row above is an independent configuration fixture. Honor the parser’s exact version-guard, block-state matching, and selector expansion behavior; the observed resolved `DynmapBlockState` set is the fixture input and digest. Cover valid initialization, initialization rejection, malformed parameters, and missing required data only where the source path exposes those outcomes. A row may not be collapsed into a representative block.',
    '',
    configCaseTable,
    '',
    '### Exact implementation symbols',
    '',
    `This file contributes ${sourceDeclarations.length} AST declarations. Every declaration is listed below; method/constructor behavior rows provide a second index to the control-flow inventory.`,
    '',
    declarationRows,
    '',
    methodRows,
    '',
    '### Source-derived branch/outcome matrix',
    '',
    'Every AST control-flow site below has an independent input fixture, Java reference trace, and focused Rust test. For numeric comparisons, the fixture set must straddle the literal boundary and include equality when the operator permits it; for switch sites, cover every listed case label plus unmatched flow when there is no default; for loops, cover zero, one, and source-derived maximum iterations. Do not replace source-derived outcomes with a visual-only PNG check.',
    '',
    branchTable,
    ...(standaloneCaseTable ? ['', '### Unconditional output case', '', standaloneCaseTable] : []),
  ].join('\n');
}

function replaceSection(document, section) {
  const heading = '## Class-specific state and branch matrix';
  const nextHeading = /\n## (?!Class-specific state and branch matrix)[^\n]+/g;
  const start = document.indexOf(heading);
  if (start >= 0) {
    nextHeading.lastIndex = start + heading.length;
    const next = nextHeading.exec(document);
    const end = next ? next.index : document.length;
    return `${document.slice(0, start).trimEnd()}\n\n${section}\n${document.slice(end).replace(/^\n+/, '')}`;
  }
  const insertion = document.indexOf('\n## 実装タスク');
  if (insertion < 0) fail('Built-in phase is missing its implementation task section');
  return `${document.slice(0, insertion).trimEnd()}\n\n${section}\n${document.slice(insertion)}`;
}

export async function populateBuiltinPlanPages({ write }) {
  const catalog = await loadJson(catalogPath);
  const dispatch = await loadJson(dispatchPath);
  const behavior = await loadGzipJson(behaviorPath);
  const ast = await loadGzipJson(astPath);
  if (catalog.sourceRevision !== dispatch.sourceRevision || catalog.sourceRevision !== behavior.sourceRevision
      || catalog.sourceRevision !== ast.sourceRevision) fail('Built-in planning inputs use different pinned revisions');
  const dispatchByClass = new Map(dispatch.classes.map((entry) => [entry.class, entry]));
  const behaviorByClass = new Map(behavior.classes.map((entry) => [entry.class, entry]));
  const updatedEntries = [];
  const fileWrites = [];
  const expectedPagePaths = new Set();
  for (const entry of catalog.entries) {
    const dispatchClass = dispatchByClass.get(entry.class);
    const behaviorClass = behaviorByClass.get(entry.class);
    if (!dispatchClass || !behaviorClass) fail(`Pinned dispatch/behavior inventory lacks ${entry.class}`);
    const sourceDeclarations = ast.declarations.filter((row) => row.sourcePath === entry.sourcePath);
    const branchCases = behaviorClass.methods.flatMap((method) => method.branches.flatMap((branch) => branch.outcomes.map((outcome) => `CASE-${branch.branchId}-${outcome.outcomeIdSuffix}`)));
    const configuredCases = dispatchClass.directDefinitions.map((definition) => `CASE-${definition.evidenceId}`);
    const stateCaseIds = uniqueSorted([...configuredCases, ...branchCases]);
    const genericDefault = stateCaseIds.length === 0 ? [`CASE-${entry.class}-default-output`] : [];
    const caseIds = uniqueSorted([...stateCaseIds, ...genericDefault]);
    const fixturePlanIds = uniqueSorted(caseIds.map((id) => `FIX-${id}`));
    const referencePlanIds = uniqueSorted(caseIds.map((id) => `REF-${id}`));
    const focusedTestPlanIds = uniqueSorted(caseIds.map((id) => `TEST-${id}`));
    const evidencePlanIds = uniqueSorted(caseIds.map((id) => `EVID-${id}`));
    const implementationSymbolIds = uniqueSorted(sourceDeclarations.map((row) => row.symbolId));
    const registrationEvidenceIds = uniqueSorted([
      dispatch.dynamicDispatch.routeId,
      ...dispatchClass.directDefinitions.map((definition) => definition.evidenceId),
    ]);
    const branchCaseIds = uniqueSorted(branchCases);
    const updated = {
      ...entry,
      registrationEvidenceIds,
      implementationSymbolIds,
      stateCaseIds: uniqueSorted([...configuredCases, ...branchCases, ...genericDefault]),
      branchCaseIds,
      fixturePlanIds,
      referencePlanIds,
      focusedTestPlanIds,
      evidencePlanIds,
      dispatchKind: dispatchClass.dispatchKind,
      pinnedDefinitionCount: dispatchClass.directDefinitions.length,
      branchSiteCount: behaviorClass.methods.reduce((total, method) => total + method.branches.length, 0),
      behaviorMethodCount: behaviorClass.methods.length,
    };
    updatedEntries.push(updated);
    const pagePath = resolve(planRoot, entry.phaseDocument);
    expectedPagePaths.add(pagePath);
    const page = await readFile(pagePath, 'utf8');
    const section = renderMatrixSection(updated, dispatchClass, behaviorClass, ast.declarations, dispatch.dynamicDispatch);
    fileWrites.push({ path: pagePath, content: replaceSection(page, section) });
  }
  const existingPagePaths = (await readdir(resolve(planRoot, 'phases/builtins')))
    .filter((name) => name.endsWith('.md'))
    .map((name) => resolve(planRoot, 'phases/builtins', name));
  const unexpectedPages = existingPagePaths.filter((path) => !expectedPagePaths.has(path));
  if (unexpectedPages.length > 0) fail(`Unexpected built-in phase pages: ${unexpectedPages.map((path) => path.slice(planRoot.length + 1)).join(', ')}`);
  const updatedCatalog = `${JSON.stringify({ ...catalog, entries: updatedEntries }, null, 2)}\n`;
  if (write) {
    await writeFile(catalogPath, updatedCatalog);
    for (const file of fileWrites) await writeFile(file.path, file.content);
  } else {
    if (await readFile(catalogPath, 'utf8') !== updatedCatalog) fail('Built-in catalog is missing or stale');
    for (const file of fileWrites) if (await readFile(file.path, 'utf8') !== file.content) fail(`Built-in phase page is missing or stale: ${file.path}`);
  }
  return { classCount: updatedEntries.length, phaseFiles: fileWrites.length, implementationSymbols: updatedEntries.reduce((total, entry) => total + entry.implementationSymbolIds.length, 0), branchCases: updatedEntries.reduce((total, entry) => total + entry.branchCaseIds.length, 0), configRows: dispatch.counts.matchingCustomBlockRecords };
}

async function run() {
  const mode = process.argv[2];
  if (mode !== '--write' && mode !== '--check') fail('Pass exactly one of --write or --check');
  const result = await populateBuiltinPlanPages({ write: mode === '--write' });
  console.log(`${mode === '--write' ? 'Populated' : 'Verified'} built-in renderer plans: `
    + `${result.classCount} classes, ${result.phaseFiles} phase pages, ${result.implementationSymbols} AST declarations, `
    + `${result.branchCases} branch outcomes, ${result.configRows} pinned configuration rows.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
