#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const PINNED_REVISION = '93b454efb8802dc7406d6873434f2aeec5c636f4';
const COLORSCHEME_PREFIX = 'DynmapCore/src/main/resources/extracted/colorschemes/';
const EXPECTED_COLORSCHEME_COUNT = 12;
const CONSUMER_SYMBOL_IDS = [
  'method:type:org.dynmap.DynmapCore#updateExtractedFiles()',
  'method:type:org.dynmap.ColorScheme#getColorSchemeDirectory(DynmapCore)',
  'method:type:org.dynmap.ColorScheme#loadScheme(DynmapCore,String)',
  'method:type:org.dynmap.ColorScheme#getScheme(DynmapCore,String)',
  'constructor:type:org.dynmap.hdmap.DefaultHDShader#%3cinit%3e(DynmapCore,ConfigurationNode)',
];
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const planRoot = resolve(scriptDirectory, '..');
const repositoryRoot = resolve(planRoot, '../../..');

const fail = (message) => { throw new Error(message); };
const canonicalJson = (value) => JSON.stringify(value, null, 2) + '\n';
const pathDigest = (sourcePath) => createHash('sha256').update(sourcePath).digest('hex').slice(0, 20);

export function materializeColorSchemeResourceCandidates(
  inventory,
  catalog,
  expectedColorSchemeCount = EXPECTED_COLORSCHEME_COUNT,
) {
  if (inventory?.sourceRevision !== PINNED_REVISION || !Array.isArray(inventory.entries)) {
    fail('Pinned resource inventory is missing or has an unexpected revision');
  }
  if (catalog?.sourceRevision !== PINNED_REVISION || !Array.isArray(catalog.entries)) {
    fail('Pinned resource catalog is missing or has an unexpected revision');
  }
  if (!Number.isSafeInteger(expectedColorSchemeCount) || expectedColorSchemeCount < 0) {
    fail('Expected color-scheme resource count must be a non-negative integer');
  }

  const inventoryByPath = new Map();
  for (const item of inventory.entries) {
    if (typeof item.sourcePath !== 'string' || inventoryByPath.has(item.sourcePath)) {
      fail('Pinned resource inventory has a missing or duplicate path');
    }
    inventoryByPath.set(item.sourcePath, item);
  }

  const catalogByPath = new Map();
  for (const entry of catalog.entries) {
    if (typeof entry.sourcePath !== 'string' || catalogByPath.has(entry.sourcePath)) {
      fail('Pinned resource catalog has a missing or duplicate path');
    }
    catalogByPath.set(entry.sourcePath, entry);
  }
  if (catalogByPath.size !== inventoryByPath.size
      || [...inventoryByPath.keys()].some((sourcePath) => !catalogByPath.has(sourcePath))) {
    fail('Resource catalog path set differs from the pinned inventory');
  }

  const colorSchemePaths = [...inventoryByPath.keys()]
    .filter((sourcePath) => sourcePath.startsWith(COLORSCHEME_PREFIX));
  if (colorSchemePaths.length !== expectedColorSchemeCount) {
    fail('Pinned color-scheme resource count changed: expected ' + expectedColorSchemeCount + ', found ' + colorSchemePaths.length);
  }

  const entries = catalog.entries.map((entry) => {
    const inventoryEntry = inventoryByPath.get(entry.sourcePath);
    if (entry.sourceRevision !== PINNED_REVISION
        || entry.gitBlobSha1 !== inventoryEntry.gitBlobSha1
        || entry.contentSha256 !== inventoryEntry.contentSha256
        || entry.byteLength !== inventoryEntry.byteLength) {
      fail('Resource catalog identity differs from pinned bytes: ' + entry.sourcePath);
    }
    if (!entry.sourcePath.startsWith(COLORSCHEME_PREFIX)) return entry;
    if (entry.scope !== 'unclassified'
        && !(entry.scope === 'renderer-runtime'
          && entry.scopeStatus === 'planned_renderer_runtime_pending_license_and_global_closure')) {
      fail('Refusing to overwrite an independently reviewed resource disposition: ' + entry.sourcePath);
    }

    const id = pathDigest(entry.sourcePath);
    return {
      ...entry,
      scope: 'renderer-runtime',
      scopeStatus: 'planned_renderer_runtime_pending_license_and_global_closure',
      consumerSymbolIds: CONSUMER_SYMBOL_IDS,
      ownerPhaseId: 'P-016',
      phaseDocument: 'phases/phase-016-biome-color-material.md',
      fixturePlanIds: ['FIX-RES-COLORSCHEME-' + id],
      referencePlanIds: ['REF-RES-COLORSCHEME-' + id],
      focusedTestPlanIds: ['TEST-RES-COLORSCHEME-' + id],
      evidencePlanIds: ['SRC-DYNMAP-COLORSCHEME-LOAD-CHAIN', 'PLAN-RES-COLORSCHEME-' + id],
      exclusionRationale: null,
      exclusionEvidenceIds: [],
      status: 'planned_renderer_runtime_pending_license_and_global_closure',
      implementationStatus: 'not_started',
    };
  });

  const unclassified = entries.filter((entry) => entry.scope === 'unclassified').length;
  const licenseUnverified = entries.filter((entry) => entry.licenseStatus !== 'verified').length;
  return {
    ...catalog,
    status: 'candidate_dispositions_open',
    classificationComplete: false,
    consumerClosureComplete: false,
    counts: {
      ...catalog.counts,
      total: entries.length,
      unclassified,
      licenseUnverified,
      plannedColorSchemeRuntime: colorSchemePaths.length,
    },
    entries,
  };
}

function parseArguments(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!['--inventory', '--catalog', '--write', '--check'].includes(flag)) fail('Unknown argument: ' + flag);
    if (flag === '--write' || flag === '--check') {
      if (values.has(flag)) fail('Duplicate mode: ' + flag);
      values.set(flag, true);
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) fail('Missing value for ' + flag);
    if (values.has(flag)) fail('Duplicate argument: ' + flag);
    values.set(flag, value);
    index += 1;
  }
  if (values.has('--write') === values.has('--check')) fail('Pass exactly one of --write or --check');
  return values;
}

async function run() {
  const args = parseArguments(process.argv.slice(2));
  const inventoryPath = resolve(repositoryRoot, args.get('--inventory') ?? 'spec/map/coverage/pinned-resource-inventory.json.gz');
  const catalogPath = resolve(repositoryRoot, args.get('--catalog') ?? 'spec/map/coverage/resources.json');
  const inventory = JSON.parse(gunzipSync(await readFile(inventoryPath)).toString('utf8'));
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  const materialized = materializeColorSchemeResourceCandidates(inventory, catalog);
  const expected = Buffer.from(canonicalJson(materialized), 'utf8');

  if (args.has('--write')) {
    await writeFile(catalogPath, expected);
  } else {
    const actual = await readFile(catalogPath).catch(() => null);
    if (!actual?.equals(expected)) fail('Color-scheme resource candidates are stale: ' + catalogPath);
  }
  console.log((args.has('--write') ? 'Wrote ' : 'Verified ') + materialized.counts.plannedColorSchemeRuntime
    + ' color-scheme runtime candidates; licenses remain unverified and global closure stays open.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
