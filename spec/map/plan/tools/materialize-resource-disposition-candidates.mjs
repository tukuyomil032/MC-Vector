#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const PINNED_REVISION = '93b454efb8802dc7406d6873434f2aeec5c636f4';
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const planRoot = resolve(scriptDirectory, '..');
const repositoryRoot = resolve(planRoot, '../../..');

const fail = (message) => { throw new Error(message); };
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonicalJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

export function materializeResourceDispositionCandidates(inventory, previousCatalog = null) {
  if (inventory?.sourceRevision !== PINNED_REVISION || !Array.isArray(inventory.entries)) {
    fail('Pinned resource inventory is missing or has an unexpected revision');
  }
  const previousRows = previousCatalog?.entries ?? [];
  const previousByPath = new Map();
  for (const row of previousRows) {
    if (typeof row.sourcePath !== 'string' || previousByPath.has(row.sourcePath)) {
      fail('Existing resource catalog has an invalid or duplicate source path');
    }
    previousByPath.set(row.sourcePath, row);
  }

  const seen = new Set();
  const entries = [...inventory.entries]
    .sort((left, right) => left.sourcePath.localeCompare(right.sourcePath))
    .map((resource) => {
      const { sourcePath, gitBlobSha1, contentSha256, byteLength } = resource;
      if (typeof sourcePath !== 'string' || seen.has(sourcePath)
          || !/^[0-9a-f]{40}$/.test(gitBlobSha1 ?? '')
          || !/^[0-9a-f]{64}$/.test(contentSha256 ?? '')
          || !Number.isSafeInteger(byteLength) || byteLength < 0) {
        fail(`Pinned resource inventory contains an invalid row: ${sourcePath ?? '(missing path)'}`);
      }
      seen.add(sourcePath);
      const prior = previousByPath.get(sourcePath);
      return {
        sourcePath,
        sourceRevision: PINNED_REVISION,
        gitBlobSha1,
        contentSha256,
        byteLength,
        candidateScope: prior && Object.hasOwn(prior, 'candidateScope') ? prior.candidateScope : prior?.scope ?? null,
        scope: 'unclassified',
        scopeStatus: 'pending_source_and_consumer_review',
        license: null,
        licenseStatus: 'unverified_per_resource',
        consumerSymbolIds: [],
        ownerPhaseId: 'P-001',
        phaseDocument: 'phases/phase-001-resource-closure.md',
        fixturePlanIds: [],
        referencePlanIds: [],
        focusedTestPlanIds: [],
        evidencePlanIds: [],
        exclusionRationale: null,
        exclusionEvidenceIds: [],
        status: 'unclassified',
        implementationStatus: 'not_started',
      };
    });

  const removed = [...previousByPath.keys()].filter((path) => !seen.has(path));
  if (removed.length) fail(`Existing resource catalog has ${removed.length} paths outside the pinned inventory`);

  return {
    schemaVersion: 3,
    sourceRepository: inventory.sourceRepository,
    sourceRevision: PINNED_REVISION,
    sourceTreeSha1: inventory.sourceTreeSha1,
    generatedBy: 'spec/map/plan/tools/materialize-resource-disposition-candidates.mjs',
    inventorySha256: null,
    status: 'candidate_dispositions_open',
    classificationComplete: false,
    consumerClosureComplete: false,
    counts: {
      total: entries.length,
      unclassified: entries.length,
      licenseUnverified: entries.length,
      newlyAddedFromPinnedInventory: entries.filter((entry) => !previousByPath.has(entry.sourcePath)).length,
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
  const inventoryBytes = await readFile(inventoryPath);
  const inventory = JSON.parse(gunzipSync(inventoryBytes).toString('utf8'));
  const previousCatalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  const materialized = materializeResourceDispositionCandidates(inventory, previousCatalog);
  materialized.inventorySha256 = sha256(inventoryBytes);
  const expected = Buffer.from(canonicalJson(materialized), 'utf8');

  if (args.has('--write')) {
    await writeFile(catalogPath, expected);
  } else {
    const actual = await readFile(catalogPath).catch(() => null);
    if (!actual?.equals(expected)) fail(`Resource disposition candidates are stale: ${catalogPath}`);
  }
  console.log(`${args.has('--write') ? 'Wrote' : 'Verified'} ${materialized.counts.total} resource disposition candidates; `
    + `${materialized.counts.unclassified} remain explicitly unclassified and strict completeness must fail.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
