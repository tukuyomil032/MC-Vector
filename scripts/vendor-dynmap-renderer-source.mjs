#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const repository = 'webbukkit/dynmap';
const revision = '93b454efb8802dc7406d6873434f2aeec5c636f4';
const root = resolve(import.meta.dirname, '..');
const boundary = resolve(root, 'src-tauri/crates/map-renderer-core/third_party/dynmap');
const catalog = JSON.parse(
  await readFile(resolve(root, 'spec/map/coverage/source-symbols.json'), 'utf8'),
);

if (catalog.sourceRevision !== revision) throw new Error('source catalog revision mismatch');

const fetchSource = async (path) => {
  const response = await fetch(
    `https://raw.githubusercontent.com/${repository}/${revision}/${path}`,
    {
      headers: { 'User-Agent': 'MC-Vector-map-source-vendor' },
    },
  );
  if (!response.ok) throw new Error(`source request failed for ${path}: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
};

const entries = [];
for (let index = 0; index < catalog.entries.length; index += 8) {
  const batch = catalog.entries.slice(index, index + 8);
  const contents = await Promise.all(batch.map((entry) => fetchSource(entry.sourcePath)));
  for (let offset = 0; offset < batch.length; offset += 1) {
    const entry = batch[offset];
    const bytes = contents[offset];
    const localPath = `upstream/${entry.sourcePath}`;
    const destination = resolve(boundary, localPath);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
    entries.push({
      sourcePath: entry.sourcePath,
      localPath,
      sourceRevision: revision,
      license: 'Apache-2.0',
      sha256: createHash('sha256').update(bytes).digest('hex'),
      rustDestination: entry.destination,
      symbols: entry.symbols,
    });
  }
}

entries.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath));

const originManifest = {
  schemaVersion: 2,
  repository,
  revision,
  license: 'Apache-2.0',
  generatedBy: 'scripts/vendor-dynmap-renderer-source.mjs',
  sourceOnly: true,
  runtimeDependency: false,
  entries,
};
await writeFile(
  resolve(boundary, 'ORIGIN-MANIFEST.json'),
  `${JSON.stringify(originManifest, null, 2)}\n`,
  'utf8',
);

const referenceLines = [
  '# Dynmap Source Reference',
  '',
  'This source-only snapshot is generated from the complete renderer closure',
  `at pinned revision \`${revision}\`. It is not compiled or bundled at runtime.`,
  '',
  `- Repository: https://github.com/${repository}`,
  `- Revision: \`${revision}\``,
  '- License: Apache-2.0; see `LICENSE-APACHE-2.0` and `NOTICE`',
  '- Machine-readable manifest: `ORIGIN-MANIFEST.json`',
  '',
  '| Local source | Upstream source | SHA-256 |',
  '| --- | --- | --- |',
  ...entries.map(
    (entry) => `| \`${entry.localPath}\` | \`${entry.sourcePath}\` | \`${entry.sha256}\` |`,
  ),
  '',
];
await writeFile(resolve(boundary, 'SOURCE-REF.md'), referenceLines.join('\n'), 'utf8');

console.log(JSON.stringify({ revision, vendoredJavaFiles: entries.length }, null, 2));
