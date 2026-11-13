// SPDX-License-Identifier: GPL-3.0-or-later
//
// Generates native/Resources/Localizable.xcstrings, the String Catalog that
// native/build.sh compiles into en.lproj and ja.lproj inside the app bundle.
//
// Sources (the only inputs):
//   - src/i18n/locales/en.ts and ja.ts: every text the Native edition shares
//     with the React UI. Nested objects are flattened to dot keys.
//   - native/Resources/native-strings.json: texts only the Native edition uses,
//     as { "<key>": { "en": "...", "ja": "..." } }. Its keys must not exist in
//     the React dictionaries.
//
// Usage: bun native/scripts/sync-strings.ts
//   Rewrites the catalog only when its content changes. The output is
//   deterministic (sorted keys, 2-space indent, trailing newline). Run it after
//   editing either source and commit the catalog; native/test.sh fails while the
//   committed catalog is out of date.

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { en } from '../../src/i18n/locales/en';
import { ja } from '../../src/i18n/locales/ja';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(SCRIPT_DIR, '..', '..');
const RESOURCES_DIR = join(SCRIPT_DIR, '..', 'Resources');
const CATALOG_PATH = join(RESOURCES_DIR, 'Localizable.xcstrings');
const NATIVE_STRINGS_PATH = join(RESOURCES_DIR, 'native-strings.json');

// Placeholders such as {version} and {{progress}}. They stay verbatim in the values.
const PLACEHOLDER = /\{\{[^{}]*\}\}|\{[^{}]*\}/g;

interface Texts {
  en: string;
  ja?: string;
}

function fail(message: string): never {
  throw new Error(message);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function kindOf(value: unknown): string {
  if (value === null || value === undefined) {
    return String(value);
  }
  if (Array.isArray(value)) {
    return 'an array';
  }
  return `a ${typeof value}`;
}

// Flattens a React dictionary into dot keys. Every leaf must be a string.
function flattenDictionary(dictionary: unknown, locale: string): Map<string, string> {
  const flat = new Map<string, string>();
  const visit = (node: Record<string, unknown>, prefix: string): void => {
    for (const [name, value] of Object.entries(node)) {
      const key = prefix === '' ? name : `${prefix}.${name}`;
      if (isPlainObject(value)) {
        visit(value, key);
      } else if (typeof value === 'string') {
        if (flat.has(key)) {
          fail(
            `${locale}: key "${key}" is defined twice (a dotted name collides with a nested key)`,
          );
        }
        flat.set(key, value);
      } else {
        fail(`${locale}: key "${key}" is ${kindOf(value)}; only strings can be exported`);
      }
    }
  };
  if (!isPlainObject(dictionary)) {
    fail(`${locale}: expected an object of translations`);
  }
  visit(dictionary, '');
  return flat;
}

// Reads native/Resources/native-strings.json and checks its shape.
async function loadNativeStrings(): Promise<Map<string, Texts>> {
  const label = relative(ROOT_DIR, NATIVE_STRINGS_PATH);
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(NATIVE_STRINGS_PATH, 'utf8'));
  } catch (error) {
    fail(`cannot read ${label}: ${errorMessage(error)}`);
  }
  if (!isPlainObject(raw)) {
    fail(`${label} must be a JSON object: { "<key>": { "en": "...", "ja": "..." } }`);
  }
  const natives = new Map<string, Texts>();
  for (const [key, entry] of Object.entries(raw)) {
    if (!isPlainObject(entry)) {
      fail(`${label}: key "${key}" must be an object with "en" and optional "ja"`);
    }
    for (const field of Object.keys(entry)) {
      if (field !== 'en' && field !== 'ja') {
        fail(`${label}: key "${key}" has an unknown field "${field}"`);
      }
    }
    const enText = entry.en;
    const jaText = entry.ja;
    if (typeof enText !== 'string') {
      fail(`${label}: key "${key}" needs a string "en" value`);
    }
    if (jaText !== undefined && typeof jaText !== 'string') {
      fail(`${label}: key "${key}" has a "ja" value that is not a string`);
    }
    natives.set(key, { en: enText, ja: jaText });
  }
  return natives;
}

// Merges the React texts with the Native-only texts. A key may come from only one side.
function mergeSources(
  reactEn: Map<string, string>,
  reactJa: Map<string, string>,
  natives: Map<string, Texts>,
): Map<string, Texts> {
  for (const key of reactJa.keys()) {
    if (!reactEn.has(key)) {
      fail(`key "${key}" is in ja.ts but not in en.ts; en is the source language`);
    }
  }
  const merged = new Map<string, Texts>();
  for (const [key, text] of reactEn) {
    merged.set(key, { en: text, ja: reactJa.get(key) });
  }
  for (const [key, texts] of natives) {
    if (reactEn.has(key) || reactJa.has(key)) {
      fail(
        `key "${key}" is in both the React dictionaries and native-strings.json; ` +
          'remove it from native-strings.json and use the React key',
      );
    }
    merged.set(key, texts);
  }
  return merged;
}

// Placeholders used by en or ja, in order of first appearance.
function placeholdersOf(texts: Texts): string[] {
  const found: string[] = [];
  for (const text of [texts.en, texts.ja ?? '']) {
    for (const match of text.matchAll(PLACEHOLDER)) {
      if (!found.includes(match[0])) {
        found.push(match[0]);
      }
    }
  }
  return found;
}

function stringUnit(value: string): Record<string, unknown> {
  return { stringUnit: { state: 'translated', value } };
}

function catalogEntry(texts: Texts): Record<string, unknown> {
  const placeholders = placeholdersOf(texts);
  const localizations: Record<string, unknown> = { en: stringUnit(texts.en) };
  if (texts.ja !== undefined) {
    localizations.ja = stringUnit(texts.ja);
  }
  return {
    ...(placeholders.length > 0 ? { comment: `Placeholders: ${placeholders.join(', ')}` } : {}),
    extractionState: 'manual',
    localizations,
  };
}

function compareKeys([a]: [string, Texts], [b]: [string, Texts]): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

function renderCatalog(merged: Map<string, Texts>): string {
  const strings: Record<string, unknown> = {};
  for (const [key, texts] of [...merged].sort(compareKeys)) {
    strings[key] = catalogEntry(texts);
  }
  const catalog = { sourceLanguage: 'en', version: '1.0', strings };
  return `${JSON.stringify(catalog, null, 2)}\n`;
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
  const reactEn = flattenDictionary(en, 'src/i18n/locales/en.ts');
  const reactJa = flattenDictionary(ja, 'src/i18n/locales/ja.ts');
  const natives = await loadNativeStrings();
  const merged = mergeSources(reactEn, reactJa, natives);

  let missingJa = 0;
  for (const [key, texts] of merged) {
    if (texts.ja === undefined) {
      missingJa += 1;
      console.warn(`warning: "${key}" has no ja text; the catalog has only its en value`);
    }
  }

  const text = renderCatalog(merged);
  const label = relative(ROOT_DIR, CATALOG_PATH);
  let action = 'unchanged';
  if ((await readIfExists(CATALOG_PATH)) !== text) {
    await writeFile(CATALOG_PATH, text, 'utf8');
    action = 'written';
  }
  console.log(
    `${label}: ${merged.size} keys (React ${reactEn.size}, native ${natives.size}), ` +
      `${missingJa} without ja (${action})`,
  );
}

main().catch((error: unknown) => {
  console.error(`error: ${errorMessage(error)}`);
  process.exit(1);
});
