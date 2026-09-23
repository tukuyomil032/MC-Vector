#!/usr/bin/env node

import { access, readFile, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const planRoot = resolve(scriptDir, '..');
const repoRoot = resolve(planRoot, '../../..');
const pinnedRevision = '93b454efb8802dc7406d6873434f2aeec5c636f4';
const stageNames = ['assets', 'anvil', 'paper-snapshot', 'reference-and-parity', 'real-acceptance'];
const errors = [];
const expect = (condition, message) => { if (!condition) errors.push(message); };
const readJson = async (path) => JSON.parse(await readFile(resolve(repoRoot, path), 'utf8'));
const exists = async (path) => access(path).then(() => true, () => false);

const walk = async (root) => {
  const paths = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) paths.push(...await walk(path));
    else paths.push(path);
  }
  return paths;
};

const sourceCatalog = await readJson('spec/map/coverage/source-symbols.json');
const resources = await readJson('spec/map/coverage/resources.json');
const builtins = await readJson('spec/map/coverage/builtin-renderers.json');
const versions = await readJson('spec/map/coverage/version-matrix.json');
const sourceMap = await readJson('spec/map/plan/coverage/source-phase-map.json');
expect(sourceCatalog.entries.length === 106, `source candidate count changed: ${sourceCatalog.entries.length}`);
expect(resources.entries.length === 3485, `resource candidate count changed: ${resources.entries.length}`);
expect(builtins.entries.length === 39, `built-in candidate count changed: ${builtins.entries.length}`);
expect(versions.entries.length === 48, `version count changed: ${versions.entries.length}`);
expect(versions.entries[0]?.minecraftVersion === '1.14' && versions.entries.at(-1)?.minecraftVersion === '26.3', 'version matrix boundaries changed');
for (const catalog of [sourceCatalog, resources, builtins]) expect(catalog.sourceRevision === pinnedRevision, 'source catalog does not use the pinned Dynmap revision');
expect(sourceMap.entries.length === sourceCatalog.entries.length, 'source-to-phase map does not cover every source candidate');

const upstreamRoot = resolve(repoRoot, 'src-tauri/crates/map-renderer-core/third_party/dynmap/upstream');
let sourceLines = 0;
for (const entry of sourceCatalog.entries) {
  const source = resolve(upstreamRoot, entry.sourcePath);
  expect(await exists(source), `pinned source candidate missing: ${entry.sourcePath}`);
  if (await exists(source)) sourceLines += (await readFile(source, 'utf8')).split('\n').length - 1;
}
expect(sourceLines === 22_783, `pinned candidate source line count changed: ${sourceLines}`);

const corePhases = (await readdir(resolve(planRoot, 'phases'))).filter((name) => /^phase-\d{3}-.+\.md$/.test(name));
const builtinPages = await walk(resolve(planRoot, 'phases/builtins'));
const versionPages = await walk(resolve(planRoot, 'phases/versions'));
expect(corePhases.length === 37, `common phase count mismatch: ${corePhases.length}`);
expect(builtinPages.filter((path) => extname(path) === '.md').length === 39, 'built-in page count is not 39');
expect(versionPages.filter((path) => extname(path) === '.md').length === 240, 'version-stage page count is not 240');
expect(corePhases.length + 39 + 240 === 316, 'expected 316 generated phase pages before AST closure expansion');

for (const entry of sourceMap.entries) {
  const owner = resolve(planRoot, entry.candidateOwnerDocument);
  expect(await exists(owner), `candidate owner page missing for ${entry.sourcePath}: ${entry.candidateOwnerDocument}`);
}
for (const entry of builtins.entries) {
  const page = resolve(planRoot, `phases/builtins/${entry.class.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}.md`);
  expect(await exists(page), `built-in phase missing: ${entry.class}`);
}
for (const entry of versions.entries) for (const stage of stageNames) {
  const page = resolve(planRoot, `phases/versions/${entry.minecraftVersion}/${stage}.md`);
  expect(await exists(page), `version stage missing: ${entry.minecraftVersion}/${stage}`);
}

const markdownRoots = [resolve(repoRoot, 'spec/map/plan'), resolve(repoRoot, 'spec/map/coverage'), resolve(repoRoot, 'spec/map/evidence')];
const markdownFiles = [];
for (const root of markdownRoots) markdownFiles.push(...(await walk(root)).filter((path) => extname(path) === '.md'));
markdownFiles.push(resolve(repoRoot, 'spec/ADR-000-index.md'));
for (const file of markdownFiles) {
  const body = await readFile(file, 'utf8');
  for (const match of body.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].split('#', 1)[0].trim();
    if (!target || /^(?:https?:|mailto:|data:)/i.test(target)) continue;
    const path = resolve(dirname(file), target);
    expect(await exists(path), `broken markdown link: ${file.replace(`${repoRoot}/`, '')} -> ${target}`);
  }
  expect(!/\b(?:TODO|TBD|TBC|FIXME)\b/i.test(body), `unresolved placeholder in ${file.replace(`${repoRoot}/`, '')}`);
}

const oldPlanPaths = [
  resolve(planRoot, 'phases/dynmap-reimplementation'),
  resolve(repoRoot, 'spec/dynmap'),
  resolve(repoRoot, 'spec/map/adr'),
  resolve(repoRoot, 'spec/map/versions'),
];
for (const path of oldPlanPaths) {
  if (await exists(path)) {
    const remaining = await walk(path);
    expect(remaining.length === 0, `legacy canonical plan path contains files: ${path.replace(`${repoRoot}/`, '')}`);
  }
}
const planPaths = await walk(planRoot);
expect(!planPaths.some((path) => /\/phase-r\d{2}-/.test(path)), 'legacy R00-R48 pages remain in canonical plan directory');

const obsoleteLinkPatterns = [/spec\/map\/adr\//, /dynmap-reimplementation/];
for (const file of markdownFiles) {
  const body = await readFile(file, 'utf8');
  for (const pattern of obsoleteLinkPatterns) expect(!pattern.test(body), `obsolete canonical link ${pattern} in ${file.replace(`${repoRoot}/`, '')}`);
}

const generatorCheck = await new Promise((resolvePromise) => {
  const child = spawn('bun', [resolve(planRoot, 'tools/generate-phase-files.mjs'), '--check'], { cwd: repoRoot, stdio: 'inherit' });
  child.on('exit', (code) => resolvePromise(code ?? 1));
});
expect(generatorCheck === 0, 'generated phase documents do not match their generator');

if (errors.length) {
  console.error(`Map renderer plan validation failed (${errors.length}):\n- ${errors.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(`Map renderer plan validated: 37 common + 39 built-ins + 240 exact-version stages; ${sourceMap.entries.length} source candidates, ${resources.entries.length} resource candidates, ${versions.entries.length} versions.`);
}
