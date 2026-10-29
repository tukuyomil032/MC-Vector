import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareVersions, isPrerelease, normalizeVersion } from './release-version.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CASK_PATH = path.join(REPO_ROOT, 'Casks', 'mc-vector.rb');

function normalizeSha256(value, label) {
  const digest = value.toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(digest)) {
    throw new Error(`${label} must be a 64-character SHA-256 digest.`);
  }
  return digest;
}

export function updateCaskSource(source, versionArg, armSha256Arg, intelSha256Arg) {
  const version = normalizeVersion(versionArg);
  if (isPrerelease(version)) {
    throw new Error(`The Homebrew Cask only tracks stable releases; received ${version}.`);
  }

  const armSha256 = normalizeSha256(armSha256Arg, 'arm SHA-256');
  const intelSha256 = normalizeSha256(intelSha256Arg, 'intel SHA-256');
  const currentVersionMatch = source.match(/^[\t ]*version[\t ]+"([^"]+)"[\t ]*$/m);
  if (!currentVersionMatch) {
    throw new Error('Could not find the current Homebrew Cask version.');
  }

  const currentVersion = normalizeVersion(currentVersionMatch[1]);
  if (compareVersions(version, currentVersion) < 0) {
    return { source, changed: false, reason: 'older_version', currentVersion, version };
  }

  const versionPattern = /^([\t ]*version[\t ]+)"[^"]+"([\t ]*)$/m;
  const shaPattern =
    /^([\t ]*sha256 arm:[\t ]*)"[a-fA-F0-9]{64}"([\t ]*,\r?\n)([\t ]*intel:[\t ]*)"[a-fA-F0-9]{64}"([\t ]*)$/m;
  if (!shaPattern.test(source)) {
    throw new Error('Could not find the architecture-specific Homebrew Cask checksums.');
  }

  const updatedSource = source
    .replace(versionPattern, `$1"${version}"$2`)
    .replace(shaPattern, `$1"${armSha256}"$2$3"${intelSha256}"$4`);

  return {
    source: updatedSource,
    changed: updatedSource !== source,
    reason: updatedSource === source ? 'unchanged' : 'updated',
    currentVersion,
    version,
  };
}

async function sha256File(filePath) {
  const bytes = await readFile(filePath);
  return createHash('sha256').update(bytes).digest('hex');
}

async function main() {
  const [versionArg, armDmgPath, intelDmgPath] = process.argv.slice(2);
  if (!versionArg || !armDmgPath || !intelDmgPath) {
    throw new Error(
      'Usage: node scripts/update-homebrew-cask.mjs <stable-version> <arm64-dmg> <intel-dmg>',
    );
  }

  const version = normalizeVersion(versionArg);
  if (isPrerelease(version)) {
    process.stdout.write(`Skipping prerelease ${version}; the Cask tracks Stable only.\n`);
    return;
  }

  const [armSha256, intelSha256, source] = await Promise.all([
    sha256File(path.resolve(armDmgPath)),
    sha256File(path.resolve(intelDmgPath)),
    readFile(CASK_PATH, 'utf8'),
  ]);
  const result = updateCaskSource(source, version, armSha256, intelSha256);

  if (result.reason === 'older_version') {
    process.stdout.write(
      `Skipping ${version}; Cask already tracks newer Stable ${result.currentVersion}.\n`,
    );
    return;
  }
  if (!result.changed) {
    process.stdout.write(`Homebrew Cask already matches ${version}.\n`);
    return;
  }

  const verification = updateCaskSource(result.source, version, armSha256, intelSha256);
  if (verification.changed || verification.reason !== 'unchanged') {
    throw new Error('Updated Homebrew Cask did not pass its metadata verification.');
  }

  await writeFile(CASK_PATH, result.source, 'utf8');
  process.stdout.write(`Updated Homebrew Cask to ${version}.\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
