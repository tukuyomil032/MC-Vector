#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { materializeResourceDispositionCandidates } from './materialize-resource-disposition-candidates.mjs';
import { materializeWebResourceExclusionCandidates } from './materialize-web-resource-exclusion-candidates.mjs';
import { materializeColorSchemeResourceCandidates } from './materialize-colorscheme-resource-candidates.mjs';
import { materializeLegacyTerrainResourceCandidates } from './materialize-legacy-terrain-resource-candidates.mjs';
import { materializeColormapTextureResourceCandidates } from './materialize-colormap-texture-resource-candidates.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const planRoot = resolve(scriptDirectory, '..');
const repositoryRoot = resolve(planRoot, '../../..');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonicalJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const fail = (message) => { throw new Error(message); };

export function materializeResourceCatalogCandidates(
  inventory,
  previousCatalog,
  inventorySha256,
  astInventory,
  expectedWebCount = 161,
  expectedColorSchemeCount = 12,
  expectedLegacyTerrainResourceCount = 224,
  expectedLegacyTerrainSlotCount = 267,
) {
  if (!/^[0-9a-f]{64}$/.test(inventorySha256 ?? '')) fail('Compressed pinned inventory SHA-256 is invalid');
  if (!astInventory) fail('Pinned Java AST inventory is required to map direct terrain texture consumers');
  const baseline = materializeResourceDispositionCandidates(inventory, previousCatalog);
  const withWebExclusions = materializeWebResourceExclusionCandidates(inventory, baseline, expectedWebCount);
  const withColorSchemeCandidates = materializeColorSchemeResourceCandidates(
    inventory,
    withWebExclusions,
    expectedColorSchemeCount,
  );
  const withLegacyTerrainCandidates = materializeLegacyTerrainResourceCandidates(
    astInventory,
    inventory,
    withColorSchemeCandidates,
    {
      expectedSlotCount: expectedLegacyTerrainSlotCount,
      expectedUniqueResourceCount: expectedLegacyTerrainResourceCount,
    },
  );
  const withColormapTextureCandidates = materializeColormapTextureResourceCandidates(
    astInventory,
    inventory,
    withLegacyTerrainCandidates,
  );
  return {
    ...withColormapTextureCandidates,
    generatedBy: 'spec/map/plan/tools/materialize-resource-catalog-candidates.mjs',
    inventorySha256,
  };
}

function parseArguments(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
  if (!['--inventory', '--ast', '--catalog', '--write', '--check'].includes(flag)) fail(`Unknown argument: ${flag}`);
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
  const astPath = resolve(repositoryRoot, args.get('--ast') ?? 'spec/map/coverage/java-ast-inventory.json.gz');
  const catalogPath = resolve(repositoryRoot, args.get('--catalog') ?? 'spec/map/coverage/resources.json');
  const inventoryBytes = await readFile(inventoryPath);
  const inventory = JSON.parse(gunzipSync(inventoryBytes).toString('utf8'));
  const astInventory = JSON.parse(gunzipSync(await readFile(astPath)).toString('utf8'));
  const previousCatalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  const materialized = materializeResourceCatalogCandidates(
    inventory,
    previousCatalog,
    sha256(inventoryBytes),
    astInventory,
  );
  const expected = Buffer.from(canonicalJson(materialized), 'utf8');

  if (args.has('--write')) {
    await writeFile(catalogPath, expected);
  } else {
    const actual = await readFile(catalogPath).catch(() => null);
    if (!actual?.equals(expected)) fail(`Resource catalog candidates are stale: ${catalogPath}`);
  }
  console.log(`${args.has('--write') ? 'Wrote' : 'Verified'} ${materialized.counts.total} resource rows; `
  + `${materialized.counts.plannedWebExclusions} web exclusions remain provisional, `
  + `${materialized.counts.plannedColorSchemeRuntime} color-scheme runtime candidates remain license-unverified, and `
  + `${materialized.counts.plannedLegacyTerrainRuntime} source-mapped terrain textures remain license-unverified; `
  + `${materialized.counts.plannedLegacyBiomeColormapRuntime} source-mapped biome colormaps remain license-unverified; `
  + `${materialized.counts.unclassified} rows remain unclassified.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
