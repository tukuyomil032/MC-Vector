import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const boundaryRoot = resolve(
  repositoryRoot,
  'src-tauri/crates/map-renderer-core/third_party/dynmap',
);
const pinnedRevision = '93b454efb8802dc7406d6873434f2aeec5c636f4';

const expectedSources = new Map([
  [
    'upstream/DynmapCore/src/main/java/org/dynmap/hdmap/HDPerspective.java',
    '1bd07eb34fbde3638c541807ed93c4545ae845e5f43364d4f82a0af9beee301f',
  ],
  [
    'upstream/DynmapCore/src/main/java/org/dynmap/hdmap/IsoHDPerspective.java',
    'dcbaacc681a6930ee3ae8e7ee7eb227382e5eb4db69d1564d2f759e4274d3692',
  ],
  [
    'upstream/DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java',
    'cbd857b896f10bb08b057a3f9ddf01ba53242b3ebd9116b163bf26739b0c48c0',
  ],
  [
    'upstream/DynmapCore/src/main/java/org/dynmap/hdmap/TexturePack.java',
    'ce8a720df763ac3c0815fe4fbe69e5a6673b02f73be464ea869111ca952ecf1c',
  ],
  [
    'upstream/DynmapCore/src/main/java/org/dynmap/hdmap/HDShader.java',
    '7075f40adc82b7e02a10305f97e78da8eb3809e017b675c1edd8d225e817e896',
  ],
  [
    'upstream/DynmapCore/src/main/java/org/dynmap/hdmap/HDLighting.java',
    '0dea1ddbb370e04ba49cd8f05d12c46e1cb0e3af0963a4f7dc86cd5c88da5413',
  ],
  [
    'upstream/DynmapCore/src/main/java/org/dynmap/utils/Matrix3D.java',
    '3b4731e0352a4764dfd975d97e0f1447d294e6b46160ce00805feba4352934e2',
  ],
  [
    'upstream/DynmapCore/src/main/java/org/dynmap/utils/PatchDefinition.java',
    '3e1db6c77caeb84fe2bcbb7d70b5db0b57a204d5b8ff4f139bfda36a54f69dcd',
  ],
  [
    'upstream/DynmapCore/src/main/resources/shaders.txt',
    '2fa0e7dce0bddd7462f5039c2f1a63153b376708e87afd8687250cb178164675',
  ],
]);

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

if (!sourceReference.includes(pinnedRevision))
  errors.push(`SOURCE-REF.md does not pin ${pinnedRevision}`);
if (!manifest.includes(pinnedRevision))
  errors.push(`ORIGIN-MANIFEST.md does not pin ${pinnedRevision}`);
if (!notice.includes('Apache License 2.0'))
  errors.push('NOTICE does not record the Apache-2.0 boundary');

for (const [relativePath, expectedHash] of expectedSources) {
  try {
    const bytes = await readFile(resolve(boundaryRoot, relativePath));
    const actualHash = createHash('sha256').update(bytes).digest('hex');
    if (actualHash !== expectedHash)
      errors.push(`${relativePath}: expected ${expectedHash}, got ${actualHash}`);
    if (!sourceReference.includes(relativePath))
      errors.push(`SOURCE-REF.md does not list ${relativePath}`);
    const upstreamPath = relativePath.replace(/^upstream\//, '');
    if (!manifest.includes(upstreamPath))
      errors.push(`ORIGIN-MANIFEST.md does not list ${upstreamPath}`);
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
    `Dynmap source boundary verified: ${expectedSources.size} files at ${pinnedRevision}`,
  );
}
