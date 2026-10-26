import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const changelogScript = join(repositoryRoot, 'scripts/changelog.mjs');
const releaseVersionScript = join(repositoryRoot, 'scripts/release-version.mjs');
const temporaryRepositories: string[] = [];

function runGit(repository: string, args: string[]) {
  const result = spawnSync('git', args, {
    cwd: repository,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
}

function createChangelogRepository() {
  const repository = mkdtempSync(join(tmpdir(), 'mc-vector-changelog-'));
  temporaryRepositories.push(repository);

  const scriptsDirectory = join(repository, 'scripts');
  mkdirSync(scriptsDirectory);
  copyFileSync(changelogScript, join(scriptsDirectory, 'changelog.mjs'));
  copyFileSync(releaseVersionScript, join(scriptsDirectory, 'release-version.mjs'));
  writeFileSync(
    join(repository, 'CHANGELOG.md'),
    '# Changelog\n\n## v2.0.63\n\n### Features\n- retain previous release history\n',
  );

  runGit(repository, ['init', '--quiet', '-b', 'main']);
  runGit(repository, ['add', 'CHANGELOG.md']);
  runGit(repository, [
    '-c',
    'user.name=MC-Vector test',
    '-c',
    'user.email=mc-vector-test@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'chore: add previous changelog entry',
  ]);
  runGit(repository, ['tag', 'v2.0.63']);

  writeFileSync(join(repository, 'feature.txt'), 'beta feature\n');
  runGit(repository, ['add', 'feature.txt']);
  runGit(repository, [
    '-c',
    'user.name=MC-Vector test',
    '-c',
    'user.email=mc-vector-test@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'feat: add beta setting',
  ]);

  return repository;
}

afterEach(() => {
  for (const repository of temporaryRepositories.splice(0)) {
    rmSync(repository, { force: true, recursive: true });
  }
});

describe('changelog generation', () => {
  it('prepends a release once while preserving the existing header and history once', () => {
    const repository = createChangelogRepository();
    const result = spawnSync(
      process.execPath,
      [join(repository, 'scripts/changelog.mjs'), 'generate', '2.0.64-beta.1', 'v2.0.63'],
      { cwd: repository, encoding: 'utf8' },
    );

    expect(result.status).toBe(0);

    const changelog = readFileSync(join(repository, 'CHANGELOG.md'), 'utf8');
    expect(changelog).toMatch(/^# Changelog\n\n## v2\.0\.64-beta\.1\n/);
    expect(changelog.match(/^# Changelog$/gm)).toHaveLength(1);
    expect(changelog.match(/^## v2\.0\.64-beta\.1$/gm)).toHaveLength(1);
    expect(changelog.match(/^## v2\.0\.63$/gm)).toHaveLength(1);
    expect(changelog.match(/^- retain previous release history$/gm)).toHaveLength(1);
    expect(changelog).toContain('### Features\n- add beta setting');
  });
});
