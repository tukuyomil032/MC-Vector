import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const releaseScript = join(repositoryRoot, 'scripts/request-release.mjs');
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

function createTemporaryDirectory() {
  const repository = mkdtempSync(join(tmpdir(), 'mc-vector-release-'));
  temporaryRepositories.push(repository);
  return repository;
}

function createRepository(branch: string) {
  const repository = createTemporaryDirectory();

  runGit(repository, ['init', '--quiet', '-b', branch]);
  writeFileSync(join(repository, '.gitkeep'), '');
  runGit(repository, ['add', '.gitkeep']);
  runGit(repository, [
    '-c',
    'user.name=MC-Vector test',
    '-c',
    'user.email=mc-vector-test@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'Initialize test repository',
  ]);

  return repository;
}

function runRelease(repository: string) {
  const ghConfigDirectory = createTemporaryDirectory();
  const result = spawnSync(process.execPath, [releaseScript, 'not-a-version'], {
    cwd: repository,
    encoding: 'utf8',
    env: {
      ...process.env,
      GH_CONFIG_DIR: ghConfigDirectory,
      GH_TOKEN: '',
      GITHUB_TOKEN: '',
    },
  });

  return result;
}

afterEach(() => {
  for (const repository of temporaryRepositories.splice(0)) {
    rmSync(repository, { force: true, recursive: true });
  }
});

describe('release main-branch guard', () => {
  it('allows main to reach the existing invalid-version validation', () => {
    const repository = createRepository('main');
    const result = runRelease(repository);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid version "not-a-version"');
  });

  it('rejects a feature branch before validating the version', () => {
    const repository = createRepository('feature/release');
    const result = runRelease(repository);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('current branch is "feature/release"');
    expect(result.stderr).not.toContain('Invalid version');
  });

  it('rejects a detached HEAD before validating the version', () => {
    const repository = createRepository('main');
    runGit(repository, ['checkout', '--quiet', '--detach', 'HEAD']);
    const result = runRelease(repository);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('HEAD is detached');
    expect(result.stderr).not.toContain('Invalid version');
  });

  it('rejects a failed branch detection before validating the version', () => {
    const repository = createTemporaryDirectory();
    const result = runRelease(repository);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('git branch --show-current');
    expect(result.stderr).not.toContain('Invalid version');
  });
});
