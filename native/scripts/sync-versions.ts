// SPDX-License-Identifier: GPL-3.0-or-later
//
// Generates native/Resources/minecraft-versions.json, the Minecraft version list
// that native/build.sh copies into Contents/Resources of the app bundle.
//
// Source (the only input):
//   - src/renderer/constants/versionOptions.ts: VERSION_OPTIONS, the version list
//     the React UI shows. The output keeps its order.
//
// Usage: bun native/scripts/sync-versions.ts
//   Rewrites the JSON only when its content changes. The output is deterministic
//   (2-space indent, trailing newline). Run it after the React list changes and
//   commit the JSON; native/test.sh fails while the committed JSON is out of date.

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { VERSION_OPTIONS } from '../../src/renderer/constants/versionOptions';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(SCRIPT_DIR, '..', '..');
const RESOURCES_DIR = join(SCRIPT_DIR, '..', 'Resources');
const OUTPUT_PATH = join(RESOURCES_DIR, 'minecraft-versions.json');
const SOURCE_LABEL = 'src/renderer/constants/versionOptions.ts';

function fail(message: string): never {
  throw new Error(message);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Checks the React list: a non-empty array of unique, non-empty strings.
function validateVersions(options: unknown): string[] {
  if (!Array.isArray(options)) {
    fail(`${SOURCE_LABEL}: VERSION_OPTIONS must be an array`);
  }
  if (options.length === 0) {
    fail(`${SOURCE_LABEL}: VERSION_OPTIONS is empty`);
  }
  const versions: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < options.length; index += 1) {
    const version: unknown = options[index];
    if (typeof version !== 'string' || version.trim() === '') {
      fail(`${SOURCE_LABEL}: entry ${index} is not a non-empty string`);
    }
    if (seen.has(version)) {
      fail(`${SOURCE_LABEL}: version "${version}" is listed more than once`);
    }
    seen.add(version);
    versions.push(version);
  }
  return versions;
}

function renderVersions(versions: string[]): string {
  return `${JSON.stringify({ versions }, null, 2)}\n`;
}

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const versions = validateVersions(VERSION_OPTIONS);

  const text = renderVersions(versions);
  const label = relative(ROOT_DIR, OUTPUT_PATH);
  let action = 'unchanged';
  if ((await readIfExists(OUTPUT_PATH)) !== text) {
    await writeFile(OUTPUT_PATH, text, 'utf8');
    action = 'written';
  }
  console.log(`${label}: ${versions.length} versions (${action})`);
}

main().catch((error: unknown) => {
  console.error(`error: ${errorMessage(error)}`);
  process.exit(1);
});
