import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, '..');
const VERSION_PATTERN = /^v?\d+\.\d+\.\d+$/;
const RELEASE_FILE_ORDER = [
  'package.json',
  'README.md',
  'src/lib/adapters/plugin/http-client.ts',
  'src/lib/version-commands.ts',
  'src-tauri/Cargo.toml',
  'src-tauri/Cargo.lock',
  'src-tauri/tauri.conf.json',
  'src-tauri/src/commands/download.rs',
  'tests/lib/adapters/plugin/http-client.test.ts',
];
const AUTHORITATIVE_FILES = [
  'package.json',
  'src-tauri/Cargo.toml',
  'src-tauri/Cargo.lock',
  'src-tauri/tauri.conf.json',
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fail(message) {
  throw new Error(message);
}

function readTarget(relativePath) {
  const absolutePath = path.join(REPOSITORY_ROOT, relativePath);

  try {
    return {
      absolutePath,
      relativePath,
      original: fs.readFileSync(absolutePath),
      text: fs.readFileSync(absolutePath, 'utf8'),
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`Unable to read ${relativePath}: ${detail}`);
  }
}

function replaceExactly(text, pattern, replacement, description) {
  const matches = [...text.matchAll(pattern)];
  if (matches.length !== 1) {
    fail(`${description}: expected exactly one matching target, found ${matches.length}.`);
  }

  const [match] = matches;
  const replacementText =
    typeof replacement === 'function'
      ? replacement(...match, match.index, text, match.groups)
      : replacement;
  const updated = `${text.slice(0, match.index)}${replacementText}${text.slice(match.index + match[0].length)}`;
  if (updated === text) {
    fail(`${description}: replacement did not change the file.`);
  }
  return updated;
}

function parseJson(relativePath, text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`${relativePath} is not valid JSON: ${detail}`);
  }
}

function assertOnlyRootVersionChanged(relativePath, beforeText, afterText, currentVersion, nextVersion) {
  const before = parseJson(relativePath, beforeText);
  const after = parseJson(relativePath, afterText);

  if (after.version !== nextVersion) {
    fail(`${relativePath}: the version field was not updated to ${nextVersion}.`);
  }

  const beforeWithoutVersion = { ...before, version: currentVersion };
  const afterWithoutVersion = { ...after, version: currentVersion };
  if (JSON.stringify(beforeWithoutVersion) !== JSON.stringify(afterWithoutVersion)) {
    fail(`${relativePath}: the computed change modifies fields other than version.`);
  }
}

function getCargoTomlPackageBlock(text) {
  const packageHeading = /^\[package\]\r?$/m.exec(text);
  if (!packageHeading || packageHeading.index === undefined) {
    fail('src-tauri/Cargo.toml: [package] section is missing.');
  }

  const blockStart = packageHeading.index;
  const bodyStart = blockStart + packageHeading[0].length;
  const nextSectionOffset = text.slice(bodyStart).search(/^\[/m);
  const blockEnd = nextSectionOffset === -1 ? text.length : bodyStart + nextSectionOffset;
  const block = text.slice(blockStart, blockEnd);

  if ([...block.matchAll(/^name = "mc-vector"\r?$/gm)].length !== 1) {
    fail('src-tauri/Cargo.toml: [package] name must be exactly mc-vector.');
  }

  return { block, blockEnd, blockStart };
}

function updateCargoToml(text, currentVersion, nextVersion) {
  const { block, blockEnd, blockStart } = getCargoTomlPackageBlock(text);
  const updatedBlock = replaceExactly(
    block,
    new RegExp(`(^version = )"${escapeRegExp(currentVersion)}"(?=\\r?$)`, 'gm'),
    (_match, prefix) => `${prefix}"${nextVersion}"`,
    'src-tauri/Cargo.toml package version',
  );

  return `${text.slice(0, blockStart)}${updatedBlock}${text.slice(blockEnd)}`;
}

function getCargoLockPackageBlocks(text) {
  const headings = [...text.matchAll(/^\[\[package\]\]\r?$/gm)];
  return headings.map((heading, index) => {
    const blockStart = heading.index;
    const bodyStart = blockStart + heading[0].length;
    const blockEnd = index + 1 < headings.length ? headings[index + 1].index : text.length;
    return { block: text.slice(blockStart, blockEnd), blockEnd, blockStart };
  });
}

function updateCargoLock(text, currentVersion, nextVersion) {
  const matchingBlocks = getCargoLockPackageBlocks(text).filter(
    ({ block }) => [...block.matchAll(/^name = "mc-vector"\r?$/gm)].length === 1,
  );

  if (matchingBlocks.length !== 1) {
    fail(`src-tauri/Cargo.lock: expected exactly one mc-vector package block, found ${matchingBlocks.length}.`);
  }

  const { block, blockEnd, blockStart } = matchingBlocks[0];
  const updatedBlock = replaceExactly(
    block,
    new RegExp(`(^version = )"${escapeRegExp(currentVersion)}"(?=\\r?$)`, 'gm'),
    (_match, prefix) => `${prefix}"${nextVersion}"`,
    'src-tauri/Cargo.lock mc-vector package version',
  );

  return `${text.slice(0, blockStart)}${updatedBlock}${text.slice(blockEnd)}`;
}

function updateJsonVersion(relativePath, text, currentVersion, nextVersion) {
  const pattern = new RegExp(`(^  "version": )"${escapeRegExp(currentVersion)}"(,?)$`, 'gm');
  const updated = replaceExactly(
    text,
    pattern,
    (_match, prefix, comma) => `${prefix}"${nextVersion}"${comma}`,
    `${relativePath} version`,
  );
  assertOnlyRootVersionChanged(relativePath, text, updated, currentVersion, nextVersion);
  return updated;
}

function updateReadmeVersion(text, currentVersion, nextVersion) {
  return replaceExactly(
    text,
    new RegExp(`version-${escapeRegExp(currentVersion)}-green`, 'g'),
    `version-${nextVersion}-green`,
    'README.md version badge',
  );
}

function updateUserAgent(relativePath, text, currentVersion, nextVersion) {
  const escapedVersion = escapeRegExp(currentVersion);
  const patterns = {
    'src/lib/adapters/plugin/http-client.ts': new RegExp(
      `(headers\\.set\\('User-Agent',\\s*'MC-Vector/)${escapedVersion}(?='\\))`,
      'g',
    ),
    'src/lib/version-commands.ts': new RegExp(
      `(const MC_VECTOR_USER_AGENT = 'MC-Vector/)${escapedVersion}(?= \\()`,
      'g',
    ),
    'src-tauri/src/commands/download.rs': new RegExp(
      `(const USER_AGENT: &str = "MC-Vector/)${escapedVersion}(?= \\()`,
      'g',
    ),
    'tests/lib/adapters/plugin/http-client.test.ts': new RegExp(
      `(toBe\\('MC-Vector/)${escapedVersion}(?='\\))`,
      'g',
    ),
  };
  const pattern = patterns[relativePath];
  if (!pattern) {
    fail(`${relativePath}: User-Agent update is not allowlisted.`);
  }

  return replaceExactly(
    text,
    pattern,
    (_match, prefix) => `${prefix}${nextVersion}`,
    `${relativePath} User-Agent literal`,
  );
}

function getVersions(files) {
  const packageJson = parseJson('package.json', files.get('package.json').text);
  if (typeof packageJson.version !== 'string' || packageJson.version.length === 0) {
    fail('package.json: version is missing or not a string.');
  }

  const cargoTomlBlock = getCargoTomlPackageBlock(files.get('src-tauri/Cargo.toml').text).block;
  const cargoTomlVersion = /^version = "([^"]+)"\r?$/m.exec(cargoTomlBlock)?.[1];
  if (!cargoTomlVersion) {
    fail('src-tauri/Cargo.toml: package version is missing.');
  }

  const cargoLockMatches = getCargoLockPackageBlocks(files.get('src-tauri/Cargo.lock').text).filter(
    ({ block }) => /^name = "mc-vector"\r?$/m.test(block),
  );
  if (cargoLockMatches.length !== 1) {
    fail(`src-tauri/Cargo.lock: expected exactly one mc-vector package block, found ${cargoLockMatches.length}.`);
  }
  const cargoLockVersion = /^version = "([^"]+)"\r?$/m.exec(cargoLockMatches[0].block)?.[1];
  if (!cargoLockVersion) {
    fail('src-tauri/Cargo.lock: mc-vector package version is missing.');
  }

  const tauriJson = parseJson('src-tauri/tauri.conf.json', files.get('src-tauri/tauri.conf.json').text);
  if (typeof tauriJson.version !== 'string' || tauriJson.version.length === 0) {
    fail('src-tauri/tauri.conf.json: version is missing or not a string.');
  }

  const versions = new Map([
    ['package.json', packageJson.version],
    ['src-tauri/Cargo.toml', cargoTomlVersion],
    ['src-tauri/Cargo.lock', cargoLockVersion],
    ['src-tauri/tauri.conf.json', tauriJson.version],
  ]);
  const uniqueVersions = new Set(versions.values());
  if (uniqueVersions.size !== 1) {
    const details = [...versions.entries()].map(([file, version]) => `${file}=${version}`).join(', ');
    fail(`Authoritative versions do not agree: ${details}.`);
  }

  return packageJson.version;
}

function assertTargetIsClean() {
  const result = spawnSync(
    'git',
    ['status', '--short', '--untracked-files=all', '--', ...RELEASE_FILE_ORDER],
    { cwd: REPOSITORY_ROOT, encoding: 'utf8' },
  );
  if (result.error) {
    fail(`Unable to check Git status: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`Git status failed with exit code ${result.status}.`);
  }
  if (result.stdout.trim().length > 0) {
    fail('Release targets are dirty; commit or stash these allowlisted files before preparing a release.');
  }
}

function computeUpdates(files, currentVersion, nextVersion) {
  const updates = new Map();
  updates.set(
    'package.json',
    updateJsonVersion('package.json', files.get('package.json').text, currentVersion, nextVersion),
  );
  updates.set('README.md', updateReadmeVersion(files.get('README.md').text, currentVersion, nextVersion));

  for (const relativePath of [
    'src/lib/adapters/plugin/http-client.ts',
    'src/lib/version-commands.ts',
    'src-tauri/src/commands/download.rs',
    'tests/lib/adapters/plugin/http-client.test.ts',
  ]) {
    updates.set(
      relativePath,
      updateUserAgent(relativePath, files.get(relativePath).text, currentVersion, nextVersion),
    );
  }

  updates.set(
    'src-tauri/Cargo.toml',
    updateCargoToml(files.get('src-tauri/Cargo.toml').text, currentVersion, nextVersion),
  );
  updates.set(
    'src-tauri/Cargo.lock',
    updateCargoLock(files.get('src-tauri/Cargo.lock').text, currentVersion, nextVersion),
  );
  updates.set(
    'src-tauri/tauri.conf.json',
    updateJsonVersion(
      'src-tauri/tauri.conf.json',
      files.get('src-tauri/tauri.conf.json').text,
      currentVersion,
      nextVersion,
    ),
  );

  for (const relativePath of RELEASE_FILE_ORDER) {
    const before = files.get(relativePath).text;
    const after = updates.get(relativePath);
    if (typeof after !== 'string' || after === before) {
      fail(`${relativePath}: expected one verified version change.`);
    }
  }

  return updates;
}

function rollback(files, writtenPaths) {
  const rollbackErrors = [];
  for (const relativePath of writtenPaths.reverse()) {
    try {
      fs.writeFileSync(files.get(relativePath).absolutePath, files.get(relativePath).original);
    } catch (error) {
      rollbackErrors.push(`${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return rollbackErrors;
}

function writeUpdates(files, updates) {
  const writtenPaths = [];
  try {
    for (const relativePath of RELEASE_FILE_ORDER) {
      writtenPaths.push(relativePath);
      fs.writeFileSync(files.get(relativePath).absolutePath, updates.get(relativePath), 'utf8');
    }
  } catch (error) {
    const rollbackErrors = rollback(files, writtenPaths);
    const detail = error instanceof Error ? error.message : String(error);
    const rollbackDetail = rollbackErrors.length > 0 ? ` Rollback failures: ${rollbackErrors.join('; ')}` : '';
    fail(`Release preparation failed while writing files: ${detail}.${rollbackDetail}`);
  }
}

function copyToClipboard(value) {
  const candidates =
    process.platform === 'darwin'
      ? [['pbcopy', []]]
      : process.platform === 'win32'
        ? [['clip', []]]
        : process.platform === 'linux'
          ? [['wl-copy', []], ['xclip', ['-selection', 'clipboard']]]
          : [];

  for (const [command, args] of candidates) {
    const result = spawnSync(command, args, {
      input: value,
      encoding: 'utf8',
      stdio: ['pipe', 'ignore', 'ignore'],
    });
    if (!result.error && result.status === 0) {
      return command;
    }
  }
  return null;
}

async function getRequestedVersion() {
  if (process.argv.length > 3) {
    fail('Usage: node scripts/prepare-release.mjs [X.Y.Z|vX.Y.Z]');
  }

  if (process.argv.length === 3) {
    return process.argv[2];
  }

  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await readline.question('Release version (X.Y.Z or vX.Y.Z): ');
  } finally {
    readline.close();
  }
}

async function main() {
  const requestedVersion = await getRequestedVersion();
  if (!VERSION_PATTERN.test(requestedVersion)) {
    fail(`Invalid version "${requestedVersion}". Use stable X.Y.Z or vX.Y.Z.`);
  }

  const nextVersion = requestedVersion.startsWith('v') ? requestedVersion.slice(1) : requestedVersion;
  const nextTag = `v${nextVersion}`;
  const files = new Map(RELEASE_FILE_ORDER.map((relativePath) => [relativePath, readTarget(relativePath)]));
  const currentVersion = getVersions(files);

  if (currentVersion === nextVersion) {
    fail(`Version ${nextTag} is already current; no files were changed.`);
  }

  assertTargetIsClean();
  const updates = computeUpdates(files, currentVersion, nextVersion);
  writeUpdates(files, updates);

  const stageCommand = `git add -- ${RELEASE_FILE_ORDER.join(' ')}`;
  const commitCommand = `git commit -m "chore: prepare release ${nextTag}"`;
  const clipboardCommand = `${stageCommand} && ${commitCommand}`;
  const clipboardProvider = copyToClipboard(clipboardCommand);

  console.log(`Prepared release ${nextTag}.`);
  console.log('Updated files:');
  for (const relativePath of RELEASE_FILE_ORDER) {
    console.log(`- ${relativePath}`);
  }
  console.log(`Commit message: chore: prepare release ${nextTag}`);
  console.log('Next command:');
  console.log(clipboardCommand);
  if (clipboardProvider) {
    console.log(`Copied the stage-and-commit command to the clipboard using ${clipboardProvider}.`);
  } else {
    console.log('Clipboard is unavailable; use the printed stage-and-commit command.');
  }
}

main().catch((error) => {
  console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
