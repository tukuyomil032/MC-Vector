import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const boundaryRoot = resolve(
  repositoryRoot,
  'src-tauri/crates/map-renderer-core/third_party/dynmap',
);
const pinnedRevision = '93b454efb8802dc7406d6873434f2aeec5c636f4';

const errors = [];
const readBoundaryFile = async (relativePath) => {
  try {
    return await readFile(resolve(boundaryRoot, relativePath), 'utf8');
  } catch {
    errors.push(`missing boundary file: ${relativePath}`);
    return '';
  }
};

const sourceReference = await readBoundaryFile('SOURCE-REF.md');
const manifest = await readBoundaryFile('ORIGIN-MANIFEST.md');
const notice = await readBoundaryFile('NOTICE');
let originManifest;
try {
  originManifest = JSON.parse(
    await readFile(resolve(boundaryRoot, 'ORIGIN-MANIFEST.json'), 'utf8'),
  );
} catch {
  errors.push('missing or invalid ORIGIN-MANIFEST.json');
  originManifest = { entries: [] };
}

if (!sourceReference.includes(pinnedRevision))
  errors.push(`SOURCE-REF.md does not pin ${pinnedRevision}`);
if (!manifest.includes(pinnedRevision))
  errors.push(`ORIGIN-MANIFEST.md does not pin ${pinnedRevision}`);
if (!notice.includes('Apache License 2.0'))
  errors.push('NOTICE does not record the Apache-2.0 boundary');

if (originManifest.revision !== pinnedRevision)
  errors.push(`ORIGIN-MANIFEST.json does not pin ${pinnedRevision}`);
if (originManifest.sourceOnly !== true || originManifest.runtimeDependency !== false)
  errors.push('ORIGIN-MANIFEST.json must describe a source-only non-runtime boundary');

for (const entry of originManifest.entries ?? []) {
  const relativePath = entry.localPath;
  const expectedHash = entry.sha256;
  try {
    const bytes = await readFile(resolve(boundaryRoot, relativePath));
    const actualHash = createHash('sha256').update(bytes).digest('hex');
    if (actualHash !== expectedHash)
      errors.push(`${relativePath}: expected ${expectedHash}, got ${actualHash}`);
    if (!sourceReference.includes(relativePath))
      errors.push(`SOURCE-REF.md does not list ${relativePath}`);
    const upstreamPath = relativePath.replace(/^upstream\//, '');
    if (entry.sourcePath !== upstreamPath)
      errors.push(`ORIGIN-MANIFEST.json path mismatch for ${relativePath}`);
  } catch {
    errors.push(`missing pinned source: ${relativePath}`);
  }
}

try {
  await readFile(resolve(repositoryRoot, 'src/map/paper/build.gradle.kts'));
  errors.push('Paper plugin must not be present in the R01 source boundary');
} catch {
  // Expected: the Paper source is reintroduced only in R06.
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `Dynmap source boundary verified: ${originManifest.entries.length} files at ${pinnedRevision}`,
  );
}
