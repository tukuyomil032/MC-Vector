#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const PINNED_REVISION = '93b454efb8802dc7406d6873434f2aeec5c636f4';
const WEB_PREFIX = 'DynmapCore/src/main/resources/extracted/web/';
const EXPECTED_WEB_RESOURCE_COUNT = 161;
const WEB_PUBLISHER_SYMBOLS = [
  'method:type:org.dynmap.DynmapCore#updateExtractedFiles()',
  'method:type:org.dynmap.DynmapCore#updateStaticWebToStorage()',
];
const WEB_PUBLISHER_EVIDENCE = 'SRC-DYNMAP-STATIC-WEB-PUBLISHER';
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const planRoot = resolve(scriptDirectory, '..');
const repositoryRoot = resolve(planRoot, '../../..');

const fail = (message) => { throw new Error(message); };
const canonicalJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

export function materializeWebResourceExclusionCandidates(
  inventory,
  catalog,
  expectedWebCount = EXPECTED_WEB_RESOURCE_COUNT,
) {
  if (inventory?.sourceRevision !== PINNED_REVISION || !Array.isArray(inventory.entries)) {
    fail('Pinned resource inventory is missing or has an unexpected revision');
  }
  if (catalog?.sourceRevision !== PINNED_REVISION || !Array.isArray(catalog.entries)) {
    fail('Pinned resource catalog is missing or has an unexpected revision');
  }
  if (!Number.isSafeInteger(expectedWebCount) || expectedWebCount < 0) {
    fail('Expected web resource count must be a non-negative integer');
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

  const webPaths = [...inventoryByPath.keys()].filter((sourcePath) => sourcePath.startsWith(WEB_PREFIX));
  if (webPaths.length !== expectedWebCount) {
    fail(`Pinned web resource count changed: expected ${expectedWebCount}, found ${webPaths.length}`);
  }

  const entries = catalog.entries.map((entry) => {
    const inventoryEntry = inventoryByPath.get(entry.sourcePath);
    if (entry.sourceRevision !== PINNED_REVISION
        || entry.gitBlobSha1 !== inventoryEntry.gitBlobSha1
        || entry.contentSha256 !== inventoryEntry.contentSha256
        || entry.byteLength !== inventoryEntry.byteLength) {
      fail(`Resource catalog identity differs from pinned bytes: ${entry.sourcePath}`);
    }
    if (!entry.sourcePath.startsWith(WEB_PREFIX)) return entry;
    if (entry.scope !== 'unclassified' && entry.scope !== 'excluded') {
      fail(`Refusing to overwrite a non-exclusion disposition: ${entry.sourcePath}`);
    }

    return {
      ...entry,
      scope: 'excluded',
      scopeStatus: 'planned_exclusion_pending_global_consumer_closure',
      consumerSymbolIds: WEB_PUBLISHER_SYMBOLS,
      ownerPhaseId: 'P-001',
      phaseDocument: 'phases/phase-001-resource-closure.md',
      fixturePlanIds: [],
      referencePlanIds: [],
      focusedTestPlanIds: [],
      evidencePlanIds: [],
      exclusionRationale: `The pinned DynmapCore publisher routes archive entries under ${WEB_PREFIX} to static web storage. This is a planned Rust-renderer exclusion only; it is not verified until the complete source/resource consumer audit proves that no rasterization, model, texture, or renderer-configuration path consumes this resource.`,
      exclusionEvidenceIds: [WEB_PUBLISHER_EVIDENCE],
      status: 'planned_exclusion_pending_global_consumer_closure',
      implementationStatus: 'not_applicable',
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
      plannedWebExclusions: webPaths.length,
    },
    entries,
  };
}

function parseArguments(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!['--inventory', '--catalog', '--write', '--check'].includes(flag)) fail(`Unknown argument: ${flag}`);
    if (flag === '--write' || flag === '--check') {
      if (values.has(flag)) fail(`Duplicate mode: ${flag}`);
      values.set(flag, true);
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) fail(`Missing value for ${flag}`);
    if (values.has(flag)) fail(`Duplicate argument: ${flag}`);
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
  const materialized = materializeWebResourceExclusionCandidates(inventory, catalog);
  const expected = Buffer.from(canonicalJson(materialized), 'utf8');

  if (args.has('--write')) {
    await writeFile(catalogPath, expected);
  } else {
    const actual = await readFile(catalogPath).catch(() => null);
    if (!actual?.equals(expected)) fail(`Web resource disposition candidates are stale: ${catalogPath}`);
  }
  console.log(`${args.has('--write') ? 'Wrote' : 'Verified'} ${materialized.counts.plannedWebExclusions} web exclusion candidates; `
    + `${materialized.counts.unclassified} resources remain unclassified and consumer closure stays open.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
