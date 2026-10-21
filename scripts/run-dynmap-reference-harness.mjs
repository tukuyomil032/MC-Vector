#!/usr/bin/env node

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const sourceRoot = resolve(root, 'src-tauri/crates/map-renderer-core/third_party/dynmap');
const harnessRoot = resolve(sourceRoot, 'reference-harness/src');
const apiRoot = resolve(sourceRoot, 'upstream/DynmapCoreAPI/src/main/java');
const coreRoot = resolve(sourceRoot, 'upstream/DynmapCore/src/main/java');
const renderer = process.argv[2];

if (!renderer || process.argv.length > 3) {
  throw new Error('usage: bun scripts/run-dynmap-reference-harness.mjs <box|cuboid|pane|plant>');
}

const temporaryRoot = await mkdtemp(join(tmpdir(), 'mc-vector-dynmap-reference-'));
const javacSources = [
  resolve(apiRoot, 'org/dynmap/renderer/CustomRenderer.java'),
  resolve(apiRoot, 'org/dynmap/renderer/MapDataContext.java'),
  resolve(apiRoot, 'org/dynmap/renderer/RenderPatch.java'),
  resolve(apiRoot, 'org/dynmap/renderer/RenderPatchFactory.java'),
  resolve(coreRoot, 'org/dynmap/hdmap/renderer/BoxRenderer.java'),
  resolve(coreRoot, 'org/dynmap/hdmap/renderer/CuboidRenderer.java'),
  resolve(coreRoot, 'org/dynmap/hdmap/renderer/PaneRenderer.java'),
  resolve(coreRoot, 'org/dynmap/hdmap/renderer/PlantRenderer.java'),
  resolve(harnessRoot, 'org/dynmap/Log.java'),
  resolve(harnessRoot, 'org/dynmap/hdmap/TexturePack.java'),
  resolve(harnessRoot, 'org/dynmap/hdmap/HDBlockStateTextureMap.java'),
  resolve(harnessRoot, 'org/dynmap/renderer/DynmapBlockState.java'),
  resolve(harnessRoot, 'org/mcvector/dynmap/reference/ReferenceHarness.java'),
];

try {
  const compile = spawnSync('javac', ['-d', temporaryRoot, ...javacSources], {
    cwd: root,
    encoding: 'utf8',
  });
  if (compile.status !== 0) {
    throw new Error(`javac failed: ${compile.stderr.trim()}`);
  }
  const run = spawnSync(
    'java',
    ['-cp', temporaryRoot, 'org.mcvector.dynmap.reference.ReferenceHarness', renderer],
    { cwd: root, encoding: 'utf8' },
  );
  if (run.status !== 0) {
    throw new Error(`reference harness failed: ${run.stderr.trim()}`);
  }
  process.stdout.write(run.stdout);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
