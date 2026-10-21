#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const repository = 'webbukkit/dynmap';
const revision = '93b454efb8802dc7406d6873434f2aeec5c636f4';
const treeUrl = `https://api.github.com/repos/${repository}/git/trees/${revision}?recursive=1`;
const root = resolve(import.meta.dirname, '..');

const relevantJava = (path) =>
  path.startsWith('DynmapCoreAPI/src/main/java/org/dynmap/renderer/') ||
  path.startsWith('DynmapCore/src/main/java/org/dynmap/hdmap/') ||
  path.startsWith('DynmapCore/src/main/java/org/dynmap/utils/');

const destinationFor = (path) => {
  if (path.includes('/renderer/')) return 'src-tauri/crates/map-renderer-core/src/builtins/';
  if (path.includes('/colormult/')) return 'src-tauri/crates/map-renderer-core/src/shaders/';
  if (path.includes('/hdmap/') && /Perspective|Matrix|Vector/.test(path)) {
    return 'src-tauri/crates/map-renderer-core/src/projection/';
  }
  if (path.includes('/hdmap/') && /Texture|Model/.test(path)) {
    return 'src-tauri/crates/map-renderer-core/src/assets/';
  }
  if (path.includes('/hdmap/') && /Lighting|Shader|Color/.test(path)) {
    return 'src-tauri/crates/map-renderer-core/src/shaders/';
  }
  if (path.includes('/utils/') && /Patch|Polygon/.test(path)) {
    return 'src-tauri/crates/map-renderer-core/src/geometry/';
  }
  if (path.includes('/utils/') && /Map|BlockStep|Light|Matrix|Vector/.test(path)) {
    return 'src-tauri/crates/map-renderer-core/src/domain/';
  }
  return 'src-tauri/crates/map-renderer-core/src/support/';
};

const classifyResource = (path) => {
  if (path.includes('/web/') || path.includes('/markers/')) return 'excluded-platform';
  if (path.includes('/texturepacks/') || path.includes('/renderdata/')) return 'renderer-asset';
  if (/\/(shaders|lightings|perspectives|colorschemes)\.txt$/.test(path))
    return 'renderer-definition';
  return 'platform-or-administration';
};

const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\s)\/\/.*$/gm, '$1');

const extractSymbols = (source) => {
  const clean = stripComments(source);
  const symbols = [];
  const seen = new Set();
  const add = (name, kind) => {
    const key = `${kind}:${name}`;
    if (!seen.has(key)) {
      seen.add(key);
      symbols.push({ name, kind });
    }
  };

  for (const match of clean.matchAll(/\b(class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/g)) {
    add(match[2], match[1]);
  }

  const methodPattern =
    /(?:^|[\n;{}])\s*(?:(?:public|protected|private|static|final|abstract|synchronized|native|default|strictfp)\s+)*[\w$<>?,.[\] ]+\s+([A-Za-z_$][\w$]*)\s*\([^;{}]*\)\s*(?:throws\s+[^{]+)?\s*[{;]/gm;
  for (const match of clean.matchAll(methodPattern)) add(match[1], 'method');

  return symbols.sort((left, right) =>
    `${left.kind}:${left.name}`.localeCompare(`${right.kind}:${right.name}`),
  );
};

const fetchJson = async (url) => {
  const response = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'MC-Vector-map-coverage' },
  });
  if (!response.ok) throw new Error(`GitHub tree request failed: ${response.status}`);
  return response.json();
};

const fetchSource = async (path) => {
  const url = `https://raw.githubusercontent.com/${repository}/${revision}/${path}`;
  const response = await fetch(url, { headers: { 'User-Agent': 'MC-Vector-map-coverage' } });
  if (!response.ok) throw new Error(`Source request failed for ${path}: ${response.status}`);
  return response.text();
};

const tree = await fetchJson(treeUrl);
if (tree.truncated) throw new Error('GitHub tree response was truncated');

const javaPaths = tree.tree
  .filter(
    (entry) => entry.type === 'blob' && entry.path.endsWith('.java') && relevantJava(entry.path),
  )
  .map((entry) => entry.path)
  .sort();
const resourcePaths = tree.tree
  .filter(
    (entry) => entry.type === 'blob' && entry.path.startsWith('DynmapCore/src/main/resources/'),
  )
  .map((entry) => entry.path)
  .sort();

const sources = [];
for (let index = 0; index < javaPaths.length; index += 8) {
  const batch = javaPaths.slice(index, index + 8);
  const contents = await Promise.all(batch.map((path) => fetchSource(path)));
  for (let offset = 0; offset < batch.length; offset += 1) {
    const path = batch[offset];
    sources.push({
      sourcePath: path,
      sourceRevision: revision,
      license: 'Apache-2.0',
      destination: destinationFor(path),
      status: 'cataloged',
      implementationStatus: 'not_started',
      symbols: extractSymbols(contents[offset]),
    });
  }
}

const sourceCatalog = {
  schemaVersion: 2,
  sourceRepository: repository,
  sourceRevision: revision,
  generatedBy: 'scripts/generate-map-renderer-coverage.mjs',
  status: 'cataloged',
  entries: sources,
};

const resourceCatalog = {
  schemaVersion: 2,
  sourceRepository: repository,
  sourceRevision: revision,
  generatedBy: 'scripts/generate-map-renderer-coverage.mjs',
  status: 'cataloged',
  entries: resourcePaths.map((sourcePath) => ({
    sourcePath,
    sourceRevision: revision,
    license: 'Apache-2.0',
    scope: classifyResource(sourcePath),
    status: 'cataloged',
    implementationStatus: 'not_started',
  })),
};

const builtinCatalog = {
  schemaVersion: 2,
  sourceRepository: repository,
  sourceRevision: revision,
  generatedBy: 'scripts/generate-map-renderer-coverage.mjs',
  status: 'cataloged',
  entries: sources
    .filter((entry) => entry.sourcePath.includes('/hdmap/renderer/'))
    .map((entry) => ({
      class: entry.symbols.find((symbol) => symbol.kind === 'class')?.name ?? entry.sourcePath,
      sourcePath: entry.sourcePath,
      sourceRevision: revision,
      rustModule: `${entry.destination}${entry.sourcePath
        .split('/')
        .at(-1)
        .replace(/\.java$/, '.rs')}`,
      requiredAssets: [],
      fixtures: [],
      referenceTrace: null,
      pixelGolden: null,
      status: 'cataloged',
      implementationStatus: 'not_started',
    })),
};

const writeJson = async (relativePath, value) => {
  const outputPath = resolve(root, relativePath);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

await writeJson('spec/map/coverage/source-symbols.json', sourceCatalog);
await writeJson('spec/map/coverage/resources.json', resourceCatalog);
await writeJson('spec/map/coverage/builtin-renderers.json', builtinCatalog);

console.log(
  JSON.stringify(
    {
      revision,
      javaFiles: javaPaths.length,
      resources: resourcePaths.length,
      builtins: builtinCatalog.entries.length,
      symbols: sources.reduce((total, entry) => total + entry.symbols.length, 0),
    },
    null,
    2,
  ),
);
