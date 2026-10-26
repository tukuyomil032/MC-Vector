import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import process from 'node:process';
import { normalizeVersion } from './release-version.mjs';

const WORKFLOW_FILE = 'prepare-release.yml';
const REPOSITORY_URL = 'https://github.com/tukuyomil032/MC-Vector';

function fail(message) {
  throw new Error(message);
}

function assertMainBranch() {
  const result = spawnSync('git', ['branch', '--show-current'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error) {
    fail(
      `Unable to detect the current Git branch with \`git branch --show-current\`: ${result.error.message}`,
    );
  }

  if (result.status !== 0) {
    const detail = result.stderr?.trim();
    const suffix = detail ? `: ${detail}` : ` (exit code ${result.status})`;
    fail(`Unable to detect the current Git branch with \`git branch --show-current\`${suffix}.`);
  }

  const branch = result.stdout.trim();
  if (!branch) {
    fail('Unable to determine the current Git branch: HEAD is detached.');
  }

  if (branch !== 'main') {
    fail(`Release preparation must run from branch "main"; current branch is "${branch}".`);
  }
}

async function getRequestedVersion() {
  if (process.argv.length > 3) {
    fail('Usage: bun run release [X.Y.Z|X.Y.Z-beta.N|vX.Y.Z|vX.Y.Z-beta.N]');
  }

  if (process.argv.length === 3) {
    return process.argv[2];
  }

  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await readline.question('Release version (X.Y.Z, X.Y.Z-beta.N, or v-prefixed): ');
  } finally {
    readline.close();
  }
}

function assertGhAvailable() {
  const result = spawnSync('gh', ['--version'], { stdio: 'ignore' });
  if (result.error?.code === 'ENOENT') {
    fail('GitHub CLI (gh) was not found. Install it from https://cli.github.com/ and try again.');
  }
  if (result.error) {
    fail(`Unable to run GitHub CLI (gh): ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail('GitHub CLI (gh) is unavailable. Check the installation and try again.');
  }
}

function assertGhAuthenticated() {
  const result = spawnSync('gh', ['auth', 'status', '--hostname', 'github.com'], {
    stdio: 'ignore',
  });
  if (result.error) {
    fail(`Unable to check GitHub CLI authentication: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail('GitHub CLI is not authenticated. Run `gh auth login` and try again.');
  }
}

function getWorkflowUrl() {
  const result = spawnSync('gh', ['repo', 'view', '--json', 'url', '--jq', '.url'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const repositoryUrl =
    result.status === 0 ? result.stdout.trim().replace(/\/$/, '') : REPOSITORY_URL;
  return `${repositoryUrl}/actions/workflows/${WORKFLOW_FILE}`;
}

function dispatchWorkflow(version) {
  const result = spawnSync(
    'gh',
    ['workflow', 'run', WORKFLOW_FILE, '--ref', 'main', '--field', `version=${version}`],
    { stdio: 'inherit' },
  );
  if (result.error) {
    fail(`Failed to dispatch the release preparation workflow: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(
      `Failed to dispatch the release preparation workflow (exit code ${result.status}). ` +
        'Confirm that prepare-release.yml exists on main and that your token can run workflows.',
    );
  }
}

async function main() {
  assertMainBranch();
  const version = normalizeVersion(await getRequestedVersion());
  assertGhAvailable();
  assertGhAuthenticated();
  dispatchWorkflow(version);

  const workflowUrl = getWorkflowUrl();
  console.log(`Release preparation dispatched for v${version}.`);
  console.log(`Watch the workflow: ${workflowUrl}`);
  console.log('Review and merge the generated PR; the Release workflow publishes after the merge.');
}

main().catch((error) => {
  console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
