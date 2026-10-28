import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { once } from 'node:events';
import { createInterface } from 'node:readline/promises';
import path from 'node:path';
import net from 'node:net';
import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { Builder, By } from 'selenium-webdriver';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tauriTarget = 'aarch64-apple-darwin';
let receivedSignal = null;
let activeResultsPath = null;
const activeChildProcesses = new Set();
const modeNames = new Map([
  ['1', 'manual'],
  ['manual', 'manual'],
  ['m', 'manual'],
  ['2', 'auto'],
  ['auto', 'auto'],
  ['a', 'auto'],
]);

export const TEST_RELEASES = Object.freeze({
  stable: Object.freeze({
    channel: 'stable',
    identifier: 'com.tukuyomi032.mcvector.updaterqa.stable',
    productName: 'MC-Vector Updater QA Stable',
    initialVersion: '0.0.1',
    candidateVersion: '0.0.2',
    target: 'stable-darwin-aarch64',
  }),
  beta: Object.freeze({
    channel: 'beta',
    identifier: 'com.tukuyomi032.mcvector.updaterqa.beta',
    productName: 'MC-Vector Updater QA Beta',
    initialVersion: '0.0.2-beta.1',
    candidateVersion: '0.0.2-beta.2',
    invalidVersion: '0.0.3-beta.1',
    target: 'beta-darwin-aarch64',
  }),
});

const testVersions = Object.freeze(
  Object.values(TEST_RELEASES).flatMap((release) =>
    [release.initialVersion, release.candidateVersion].filter(Boolean),
  ),
);

export function withoutAppleSigningEnvironment(sourceEnvironment) {
  const environment = { ...sourceEnvironment };
  for (const name of Object.keys(environment)) {
    if (name.startsWith('APPLE_')) delete environment[name];
  }
  return environment;
}

export function createUpdaterBuildEnvironment(sourceEnvironment, keyPath) {
  const environment = withoutAppleSigningEnvironment(sourceEnvironment);
  delete environment.TAURI_SIGNING_PRIVATE_KEY_PATH;
  environment.PATH = ['/usr/bin', environment.PATH].filter(Boolean).join(path.delimiter);
  return {
    ...environment,
    TAURI_SIGNING_PRIVATE_KEY: keyPath,
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: '',
    APPLE_SIGNING_IDENTITY: '-',
    CI: '1',
  };
}

export function createTauriBuildArgs(configPath) {
  return [
    'run',
    'tauri',
    'build',
    '--bundles',
    'app',
    '--target',
    tauriTarget,
    '--features',
    'updater-e2e',
    '--config',
    configPath,
    '--ci',
    '--ignore-version-mismatches',
  ];
}

export function isQaBundleArtifactName(name) {
  return Object.values(TEST_RELEASES).some((release) => {
    if (
      name === `${release.productName}.app` ||
      name === `${release.productName}.app.tar.gz` ||
      name === `${release.productName}.app.tar.gz.sig`
    ) {
      return true;
    }
    return testVersions.some((version) => {
      const versionPrefix = `${release.productName}_${version}`;
      return (
        name.startsWith(`${versionPrefix}_`) &&
        (name.endsWith('.app.tar.gz') || name.endsWith('.app.tar.gz.sig'))
      );
    });
  });
}

export function removeQaBundleArtifacts(directory) {
  if (!existsSync(directory)) return [];
  const removed = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!isQaBundleArtifactName(entry.name)) continue;
    rmSync(path.join(directory, entry.name), { recursive: true, force: true });
    removed.push(entry.name);
  }
  return removed;
}

export function runtimeDirectoryFor(runDirectory) {
  const resultsRoot = path.join(projectRoot, 'test-results', 'updater-local');
  const resolvedRunDirectory = path.resolve(runDirectory);
  const relativeRunDirectory = path.relative(resultsRoot, resolvedRunDirectory);
  if (
    !relativeRunDirectory ||
    relativeRunDirectory === '..' ||
    relativeRunDirectory.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeRunDirectory)
  ) {
    throw new Error('Updater runtime must be a child of test-results/updater-local');
  }
  return path.join(resolvedRunDirectory, 'runtime');
}

export function cleanupRuntimeDirectory(runDirectory) {
  const runtimeDirectory = runtimeDirectoryFor(runDirectory);
  rmSync(runtimeDirectory, { recursive: true, force: true });
  return runtimeDirectory;
}

function trackChildProcess(child) {
  activeChildProcesses.add(child);
  const release = () => activeChildProcesses.delete(child);
  child.once('exit', release);
  child.once('error', release);
}

function abortForSignal(signal, readline, resultsPath) {
  const isRepeatedSignal = Boolean(receivedSignal);
  if (isRepeatedSignal) {
    process.stderr.write(
      '[updater-local] Second interrupt received; forcing child process shutdown\n',
    );
  } else {
    receivedSignal = signal;
    if (resultsPath) {
      try {
        appendLog(resultsPath, `${signal} received; stopping updater harness`);
      } catch {
        // Keep signal handling active even if diagnostics cannot be written.
      }
    }
    process.stderr.write(
      `[updater-local] ${signal} received; stopping and cleaning up QA runtime\n`,
    );
    readline.close();
  }
  for (const child of activeChildProcesses) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    try {
      child.kill(isRepeatedSignal ? 'SIGKILL' : 'SIGTERM');
    } catch {
      // The child may have exited between the status check and kill.
    }
    const forceKillTimer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        try {
          child.kill('SIGKILL');
        } catch {
          // The child may have exited between the status check and kill.
        }
      }
    }, 1_500);
    forceKillTimer.unref();
  }
}

function throwIfAborted() {
  if (receivedSignal) {
    throw new Error(`${receivedSignal} received; updater harness is aborting`);
  }
}

export function findQaAppProcesses(processListText, executables, ignoredPid = process.pid) {
  return processListText
    .split(/\r?\n/)
    .map((line) => /^\s*(\d+)\s+(.+)$/.exec(line))
    .filter((match) => match && Number(match[1]) !== ignoredPid)
    .filter((match) => {
      const command = match[2].trimStart();
      return executables.some(
        (executable) => command === executable || command.startsWith(`${executable} `),
      );
    })
    .map((match) => ({ pid: Number(match[1]), command: match[2] }));
}

async function terminateQaAppProcesses(executables, resultsPath) {
  if (process.platform !== 'darwin') return;
  const findProcesses = () => {
    const processList = spawnSync('/bin/ps', ['-axo', 'pid=,command='], {
      encoding: 'utf8',
      timeout: 5_000,
    });
    if (processList.error || processList.status !== 0) {
      throw processList.error ?? new Error('Could not inspect running processes');
    }
    return findQaAppProcesses(processList.stdout, executables);
  };

  let running;
  try {
    running = findProcesses();
  } catch (error) {
    if (resultsPath)
      appendLog(
        resultsPath,
        `Could not inspect processes before runtime cleanup: ${String(error)}`,
      );
    return;
  }
  for (const { pid } of running) {
    try {
      process.kill(pid, 'SIGTERM');
      if (resultsPath) appendLog(resultsPath, `sent SIGTERM to QA app process ${pid}`);
    } catch (error) {
      if (resultsPath)
        appendLog(resultsPath, `could not stop QA app process ${pid}: ${String(error)}`);
    }
  }

  const deadline = Date.now() + 1_500;
  while (running.length > 0 && Date.now() < deadline) {
    await delay(100);
    try {
      running = findProcesses();
    } catch (error) {
      if (resultsPath) appendLog(resultsPath, `Could not verify QA app shutdown: ${String(error)}`);
      return;
    }
  }

  for (const { pid } of running) {
    try {
      process.kill(pid, 'SIGKILL');
      if (resultsPath) appendLog(resultsPath, `sent SIGKILL to remaining QA app process ${pid}`);
    } catch (error) {
      if (resultsPath)
        appendLog(resultsPath, `could not force-stop QA app process ${pid}: ${String(error)}`);
    }
  }
}

async function terminateQaAppProcess(appPath, resultsPath) {
  if (!appPath || !existsSync(appPath)) return;
  await terminateQaAppProcesses([appExecutable(appPath)], resultsPath);
}

async function terminateRunningQaApps(runtimePath, resultsPath) {
  if (!runtimePath) return;
  const qaExecutables = Object.values(TEST_RELEASES)
    .map((release) => path.join(runtimePath, 'apps', release.channel, `${release.productName}.app`))
    .filter((appPath) => existsSync(appPath))
    .map((appPath) => appExecutable(appPath));
  await terminateQaAppProcesses(qaExecutables, resultsPath);
}

export function parseModeInput(input) {
  return modeNames.get(String(input).trim().toLowerCase()) ?? null;
}

export function createTauriOverlay({ release, version, pubkey, port, infoPlistPath }) {
  if (!Object.values(TEST_RELEASES).includes(release)) {
    throw new Error('Unknown local updater test release channel');
  }
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('Updater harness requires a valid local HTTP port');
  }
  const endpoint = `http://127.0.0.1:${port}/updates/{{target}}.json`;
  assertLoopbackHttpUrl(endpoint.replace('{{target}}', 'stable-darwin-aarch64'));
  const infoPlist =
    infoPlistPath ?? `${release.channel}-${version.replaceAll('.', '-')}.Info.plist`;

  return {
    productName: release.productName,
    version,
    identifier: release.identifier,
    app: {
      windows: [{ title: release.productName }],
    },
    bundle: {
      targets: ['app'],
      createUpdaterArtifacts: true,
      macOS: { infoPlist },
    },
    plugins: {
      updater: {
        active: true,
        pubkey,
        endpoints: [endpoint],
        dangerousInsecureTransportProtocol: true,
      },
    },
  };
}

export function createQaInfoPlist(version) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid local test version for Info.plist: ${version}`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n  <key>MCVectorUpdaterQAVersion</key>\n  <string>${version}</string>\n</dict>\n</plist>\n`;
}

export function createTargetManifest({ version, signature, assetPath, baseUrl }) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid local test version: ${version}`);
  }
  if (!signature || typeof signature !== 'string') {
    throw new Error('Local updater manifest is missing its test signature');
  }
  if (!assetPath.startsWith('/assets/')) {
    throw new Error('Updater artifact must use the local /assets route');
  }
  assertLoopbackHttpUrl(baseUrl);
  return {
    version,
    notes: `Local updater harness candidate ${version}`,
    pub_date: '2026-10-27T00:00:00Z',
    url: new URL(assetPath, baseUrl).toString(),
    signature,
  };
}

export function assertLoopbackHttpUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)) {
    throw new Error(`Updater harness URL must use loopback HTTP: ${value}`);
  }
}

function log(message) {
  process.stdout.write(`[updater-local] ${message}\n`);
}

function describeError(error) {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

function waitFor(predicate, message, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  return (async () => {
    let lastError;
    while (Date.now() < deadline) {
      throwIfAborted();
      try {
        const value = await predicate();
        if (value) {
          throwIfAborted();
          return value;
        }
      } catch (error) {
        lastError = error;
      }
      await delay(150);
    }
    const detail = lastError instanceof Error ? `: ${lastError.message}` : '';
    throw new Error(`${message}${detail}`);
  })();
}

function appendLog(resultsPath, message) {
  appendFileSync(path.join(resultsPath, 'run.log'), `${new Date().toISOString()} ${message}\n`);
}

function runProcess(command, args, { cwd = projectRoot, env = process.env, onOutput } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    trackChildProcess(child);
    let output = '';
    let settled = false;
    for (const stream of [child.stdout, child.stderr]) {
      stream.on('data', (chunk) => {
        let text = chunk.toString();
        const privateKey = env.TAURI_SIGNING_PRIVATE_KEY;
        if (typeof privateKey === 'string' && privateKey.length > 0) {
          text = text.replaceAll(privateKey, '[test signing key redacted]');
        }
        output += text;
        onOutput?.(text);
        process.stdout.write(text);
      });
    }
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    child.once('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      if (code === 0) resolve({ output, child });
      else reject(new Error(`${command} exited with ${signal ?? `code ${code}`}\n${output}`));
    });
  });
}

export async function promptLine(readline, question, assertActive = throwIfAborted) {
  assertActive();
  let answer;
  try {
    answer = await readline.question(`${question}\n> `);
  } catch (error) {
    if (error?.name !== 'AbortError') throw error;
    if (!receivedSignal) abortForSignal('SIGINT', readline, activeResultsPath);
    throwIfAborted();
  }
  assertActive();
  return answer.trim();
}

async function confirmManualPass(readline, question) {
  const answer = await promptLine(readline, question);
  if (/^(?:n|no|fail|failed)$/i.test(answer)) {
    throw new Error('Manual updater scenario was marked as failed by the user');
  }
}

async function chooseMode(readline) {
  log('Choose a run mode: 1) Manual  2) Automatic');
  while (true) {
    const mode = parseModeInput(await promptLine(readline, 'Select (manual/auto or 1/2)'));
    if (mode) return mode;
    log('Enter manual or auto.');
  }
}

function assertMacArm64() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error(
      `This harness currently supports macOS ARM64 only (detected ${process.platform}/${process.arch}).`,
    );
  }
}

function assertCommandAvailable(command, args = ['--help']) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: 'ignore' });
  if (result.error || result.status !== 0) {
    throw new Error(`Required command is unavailable: ${command}`);
  }
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  if (!port) throw new Error('Could not reserve a loopback port for the updater feed');
  return port;
}

function generateTestKeyPair(testRoot) {
  const keyPath = path.join(testRoot, 'updater-test.key');
  const publicKeyPath = `${keyPath}.pub`;
  const keyEnvironment = withoutAppleSigningEnvironment({ ...process.env, CI: '1' });
  delete keyEnvironment.TAURI_SIGNING_PRIVATE_KEY;
  delete keyEnvironment.TAURI_SIGNING_PRIVATE_KEY_PASSWORD;
  delete keyEnvironment.TAURI_SIGNING_PRIVATE_KEY_PATH;
  const result = spawnSync(
    'bun',
    ['run', 'tauri', 'signer', 'generate', '--write-keys', keyPath, '--password', '', '--ci'],
    { cwd: projectRoot, encoding: 'utf8', env: keyEnvironment },
  );
  if (result.error || result.status !== 0) {
    throw new Error(
      `Could not create the disposable updater signing key: ${result.stderr ?? result.error}`,
    );
  }
  if (!existsSync(keyPath)) throw new Error('Tauri did not create the disposable private key');
  if (!existsSync(publicKeyPath)) throw new Error('Tauri did not create the disposable public key');
  chmodSync(keyPath, 0o600);
  const publicKey = readFileSync(publicKeyPath, 'utf8').trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(publicKey)) {
    throw new Error('Tauri did not write a usable disposable public key');
  }
  return { keyPath, pubkey: publicKey };
}

function writeOverlay(testRoot, release, version, pubkey, port) {
  const infoPlistFilename = `${release.channel}-${version.replaceAll('.', '-')}.Info.plist`;
  const infoPlistPath = path.join(testRoot, infoPlistFilename);
  const overlay = createTauriOverlay({ release, version, pubkey, port, infoPlistPath });
  const filename = `${release.channel}-${version.replaceAll('.', '-')}.tauri.conf.json`;
  const filePath = path.join(testRoot, filename);
  writeFileSync(infoPlistPath, createQaInfoPlist(version), { mode: 0o600 });
  writeFileSync(filePath, `${JSON.stringify(overlay, null, 2)}\n`, { mode: 0o600 });
  return filePath;
}

function locateBundleDirectory() {
  const candidates = bundleDirectoryCandidates();
  const existing = candidates.find((candidate) => existsSync(candidate));
  if (!existing) {
    throw new Error(
      `Tauri macOS bundle directory was not found. Checked: ${candidates.join(', ')}`,
    );
  }
  return existing;
}

function bundleDirectoryCandidates() {
  return [
    path.join(projectRoot, 'src-tauri', 'target', tauriTarget, 'release', 'bundle', 'macos'),
    path.join(projectRoot, 'src-tauri', 'target', 'release', 'bundle', 'macos'),
  ];
}

function cleanupQaBundleArtifacts(resultsPath) {
  let removedCount = 0;
  for (const directory of bundleDirectoryCandidates()) {
    removedCount += removeQaBundleArtifacts(directory).length;
  }
  if (resultsPath) appendLog(resultsPath, `QA bundle cleanup removed ${removedCount} item(s)`);
  return removedCount;
}

function getAppVersionFromBundle(appPath) {
  const plistPath = path.join(appPath, 'Contents', 'Info.plist');
  const result = spawnSync(
    '/usr/libexec/PlistBuddy',
    ['-c', 'Print :MCVectorUpdaterQAVersion', plistPath],
    { encoding: 'utf8' },
  );
  if (result.error || result.status !== 0) {
    throw new Error(`Could not read test application version from ${plistPath}`);
  }
  return result.stdout.trim();
}

function findNewestUpdaterArchive(bundleDirectory, since) {
  if (!existsSync(bundleDirectory))
    throw new Error(`Tauri bundle directory is missing: ${bundleDirectory}`);
  const candidates = readdirSync(bundleDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.app.tar.gz'))
    .map((entry) => path.join(bundleDirectory, entry.name))
    .filter((filePath) => {
      try {
        return statSync(filePath).mtimeMs >= since;
      } catch {
        return false;
      }
    })
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
  if (candidates.length === 0) {
    throw new Error(`Tauri did not produce an updater archive in ${bundleDirectory}`);
  }
  const archivePath = candidates[0];
  const signaturePath = `${archivePath}.sig`;
  if (!existsSync(signaturePath) || !readFileSync(signaturePath, 'utf8').trim()) {
    throw new Error(`Tauri did not produce a signed updater archive: ${archivePath}`);
  }
  return { archivePath, signaturePath };
}

function findBundleApp(bundleDirectory, productName) {
  const expected = path.join(bundleDirectory, `${productName}.app`);
  if (existsSync(path.join(expected, 'Contents', 'Info.plist'))) return expected;
  const matches = readdirSync(bundleDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith('.app'))
    .map((entry) => path.join(bundleDirectory, entry.name))
    .filter((appPath) => {
      try {
        return readFileSync(path.join(appPath, 'Contents', 'Info.plist'), 'utf8').includes(
          productName,
        );
      } catch {
        return false;
      }
    });
  if (matches.length !== 1) {
    throw new Error(
      `Expected one ${productName}.app bundle in ${bundleDirectory}, found ${matches.length}`,
    );
  }
  return matches[0];
}

async function buildVersion({
  release,
  version,
  pubkey,
  port,
  testRoot,
  buildEnvironment,
  resultsPath,
}) {
  const overlayPath = writeOverlay(testRoot, release, version, pubkey, port);
  const commandStartedAt = Date.now() - 1_000;
  appendLog(resultsPath, `build started channel=${release.channel} version=${version}`);
  log(`release build: ${release.channel} ${version}`);
  await runProcess('bun', createTauriBuildArgs(overlayPath), {
    cwd: projectRoot,
    env: buildEnvironment,
    onOutput: (text) => appendFileSync(path.join(resultsPath, 'build.log'), text),
  });

  const bundleDirectory = locateBundleDirectory();
  const sourceAppPath = findBundleApp(bundleDirectory, release.productName);
  const discoveredVersion = getAppVersionFromBundle(sourceAppPath);
  if (discoveredVersion !== version) {
    throw new Error(
      `Tauri app bundle version mismatch: expected ${version}, found ${discoveredVersion} (${sourceAppPath})`,
    );
  }
  const { archivePath, signaturePath } = findNewestUpdaterArchive(
    bundleDirectory,
    commandStartedAt,
  );
  const assetName = `${release.channel}-${version}.app.tar.gz`;
  const assetCopyPath = path.join(testRoot, 'assets', assetName);
  mkdirSync(path.dirname(assetCopyPath), { recursive: true });
  copyFileSync(archivePath, assetCopyPath);
  const signature = readFileSync(signaturePath, 'utf8').trim();
  if (!signature) throw new Error(`Updater signature is empty for ${version}`);

  let appPath = null;
  if (version === release.initialVersion) {
    appPath = path.join(testRoot, 'apps', release.channel, `${release.productName}.app`);
    mkdirSync(path.dirname(appPath), { recursive: true });
    cpSync(sourceAppPath, appPath, { recursive: true, force: true });
  }
  appendLog(
    resultsPath,
    `build complete channel=${release.channel} version=${version} archive=${path.basename(archivePath)}`,
  );
  return { version, appPath, assetName, assetCopyPath, signature };
}

export function tamperSignature(signature) {
  const encodedEnvelope = signature.trim();
  const signatureEnvelope = Buffer.from(encodedEnvelope, 'base64');
  if (
    encodedEnvelope.length === 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encodedEnvelope) ||
    signatureEnvelope.toString('base64') !== encodedEnvelope
  ) {
    throw new Error('Cannot mutate a signature that is not Base64 encoded');
  }

  const minisignText = signatureEnvelope.toString('utf8');
  if (!Buffer.from(minisignText, 'utf8').equals(signatureEnvelope)) {
    throw new Error('Cannot decode the Base64 updater signature as UTF-8 Minisign text');
  }
  const lines = minisignText.trimEnd().split(/\r?\n/);
  if (
    lines.length !== 4 ||
    !lines[0].startsWith('untrusted comment: ') ||
    !lines[2].startsWith('trusted comment: ')
  ) {
    throw new Error('Cannot mutate a signature that is not in Minisign text format');
  }

  const encodedSignature = lines[1];
  const signatureBytes = Buffer.from(encodedSignature, 'base64');
  const originalSignatureBytes = Buffer.from(signatureBytes);
  if (
    encodedSignature.length <= 20 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encodedSignature) ||
    signatureBytes.length !== 74 ||
    signatureBytes.toString('base64') !== encodedSignature
  ) {
    throw new Error('Cannot mutate the Minisign signature payload');
  }

  signatureBytes[10] ^= 0x01;
  lines[1] = signatureBytes.toString('base64');
  const mutatedBytes = Buffer.from(lines[1], 'base64');
  if (originalSignatureBytes.subarray(0, 10).compare(mutatedBytes.subarray(0, 10)) !== 0) {
    throw new Error('Mutating the Minisign payload changed its algorithm or key identifier');
  }
  if (originalSignatureBytes.subarray(10).compare(mutatedBytes.subarray(10)) === 0) {
    throw new Error('Could not mutate the Minisign cryptographic signature bytes');
  }
  return Buffer.from(lines.join('\n'), 'utf8').toString('base64');
}

function makeManifest(build, baseUrl, version = build.version, signature = build.signature) {
  return createTargetManifest({
    version,
    signature,
    assetPath: `/assets/${build.assetName}`,
    baseUrl,
  });
}

async function startFeedServer({ port, manifests, assets, resultsPath }) {
  const server = createServer((request, response) => {
    const requestPath = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    appendLog(resultsPath, `feed request ${request.method ?? 'GET'} ${requestPath}`);
    if (request.method !== 'GET') {
      response.writeHead(405).end('Method Not Allowed');
      return;
    }
    const manifestMatch = /^\/updates\/(stable|beta)-darwin-aarch64\.json$/.exec(requestPath);
    if (manifestMatch) {
      const manifest = manifests.get(manifestMatch[1]);
      if (!manifest) {
        response.writeHead(404).end('Feed not found');
        return;
      }
      const body = Buffer.from(`${JSON.stringify(manifest)}\n`, 'utf8');
      response.writeHead(200, {
        'content-type': 'application/json',
        'content-length': body.length,
      });
      response.end(body);
      return;
    }
    const asset = assets.get(requestPath);
    if (!asset) {
      response.writeHead(404).end('Asset not found');
      return;
    }
    response.writeHead(200, {
      'content-type': 'application/gzip',
      'content-length': asset.length,
      'cache-control': 'no-store',
    });
    response.end(asset);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address !== 'object' || address.address !== '127.0.0.1') {
    await new Promise((resolve) => server.close(resolve));
    throw new Error('Updater test feed must bind exclusively to 127.0.0.1');
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}/`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

function appExecutable(appPath) {
  const executable = path.join(appPath, 'Contents', 'MacOS', path.basename(appPath, '.app'));
  if (!existsSync(executable)) {
    const macOSDirectory = path.join(appPath, 'Contents', 'MacOS');
    const files = readdirSync(macOSDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(macOSDirectory, entry.name));
    if (files.length !== 1)
      throw new Error(`Could not identify app executable in ${macOSDirectory}`);
    return files[0];
  }
  return executable;
}

function launchManualApp(appPath, env) {
  const result = spawnSync('open', ['-n', appPath], { encoding: 'utf8', env });
  if (result.error || result.status !== 0) {
    throw new Error(
      `Could not launch ${appPath}: ${result.stderr ?? result.error ?? result.status}`,
    );
  }
}

async function startWebDriver(environment, port, resultsPath) {
  const child = spawn('tauri-wd', ['--port', String(port), '--log-level', 'debug'], {
    cwd: projectRoot,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  trackChildProcess(child);
  const output = [];
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => {
      const text = chunk.toString();
      output.push(text);
      appendFileSync(path.join(resultsPath, 'webdriver.log'), text);
      if (output.length > 100) output.shift();
    });
  }
  const serverUrl = `http://127.0.0.1:${port}`;
  try {
    await waitFor(
      async () => {
        if (child.exitCode !== null) throw new Error(`tauri-wd exited: ${output.join('')}`);
        try {
          return (await fetch(`${serverUrl}/status`)).ok;
        } catch {
          return false;
        }
      },
      `tauri-wd did not become ready at ${serverUrl}`,
      20_000,
    );
  } catch (error) {
    child.kill('SIGTERM');
    throw error;
  }
  return { child, serverUrl, output };
}

async function createWebDriver(serverUrl, appPath) {
  const driver = await new Builder()
    .usingServer(serverUrl)
    .withCapabilities({
      browserName: 'tauri',
      platformName: 'mac',
      'tauri:options': { binary: appExecutable(appPath) },
    })
    .build();
  await driver.manage().setTimeouts({ implicit: 500, pageLoad: 15_000, script: 20_000 });
  return driver;
}

async function visibleElement(driver, selector, timeoutMs = 30_000) {
  return waitFor(
    () => driver.findElement(By.css(selector)),
    `${selector} did not appear`,
    timeoutMs,
  );
}

async function click(driver, selector) {
  const element = await visibleElement(driver, selector);
  await waitFor(() => element.isEnabled(), `${selector} stayed disabled`);
  await element.click();
}

async function saveScreenshot(driver, resultsPath, name) {
  const screenshot = await driver.takeScreenshot();
  const screenshotPath = path.join(resultsPath, `${name}.png`);
  writeFileSync(screenshotPath, Buffer.from(screenshot, 'base64'));
  appendLog(resultsPath, `screenshot ${path.basename(screenshotPath)}`);
}

async function selectChannel(driver, channel) {
  await driver.executeScript(
    `
      const select = document.querySelector('[data-testid="update-channel-select"]');
      if (!select) throw new Error('Update channel selector is missing');
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(select, arguments[0]);
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    `,
    channel,
  );
  await waitFor(
    () =>
      driver.executeScript(
        'return document.querySelector("[data-testid=update-channel-select]")?.value === arguments[0]',
        channel,
      ),
    `Update channel did not change to ${channel}`,
  );
  const actual = await driver.executeScript(
    'return document.querySelector("[data-testid=update-channel-select]")?.value',
  );
  assert.equal(actual, channel);
}

async function openSettings(driver, resultsPath, screenshotName) {
  await click(driver, '[data-testid="sidebar-brand-button"]');
  await visibleElement(driver, '[data-testid="settings-window"]');
  await delay(2_000);
  await saveScreenshot(driver, resultsPath, screenshotName);
}

export async function waitForAvailableVersion(driver, version) {
  await waitFor(async () => {
    return driver.executeScript(
      'return document.querySelector("[data-testid=update-status-version]")?.getAttribute("data-version") === arguments[0]',
      version,
    );
  }, `Expected updater to offer ${version}`);
}

async function waitForResultScreen(driver, resultsPath, screenshotName) {
  await delay(5_000);
  await saveScreenshot(driver, resultsPath, screenshotName);
}

async function verifyNoUpdate(
  driver,
  expectedInstalledVersion,
  appPath,
  resultsPath,
  screenshotName,
) {
  await waitFor(async () => {
    const status = await driver.findElement(By.css('[data-testid="update-status"]'));
    return /up to date|latest|最新/i.test(await status.getText());
  }, 'Updater did not finish with a no-update result');
  const statusText = await driver.findElement(By.css('[data-testid="update-status"]')).getText();
  const hasError = /\berror\b|エラー/i.test(statusText);
  assert.equal(hasError, false, `Updater showed an error: ${statusText}`);
  assert.equal(
    await driver
      .findElements(By.css('[data-testid="update-status-version"]'))
      .then((items) => items.length),
    0,
  );
  assert.equal(
    getAppVersionFromBundle(appPath),
    expectedInstalledVersion,
    'An old channel feed downgraded the app',
  );
  await waitForResultScreen(driver, resultsPath, screenshotName);
}

export async function reconnectDriver(
  existingDriver,
  serverUrl,
  appPath,
  resultsPath,
  { stopApp = terminateQaAppProcess, createSession = createWebDriver, pause = delay } = {},
) {
  try {
    await existingDriver.executeScript('return document.title');
    return existingDriver;
  } catch {
    await existingDriver.quit().catch(() => undefined);
    if (resultsPath) {
      appendLog(
        resultsPath,
        'macOS LaunchServices restart dropped TAURI_WEBVIEW_AUTOMATION; stopping the exact QA app process and relaunching through a fresh tauri-wd session',
      );
    }
    await stopApp(appPath, resultsPath);
    await pause(500);
    return createSession(serverUrl, appPath);
  }
}

async function applyUpdateAutomatically({
  driver,
  serverUrl,
  appPath,
  channel,
  expectedVersion,
  resultsPath,
  screenshotPrefix,
}) {
  if (channel === 'stable') {
    await click(driver, '[data-testid="update-check-button"]');
    await waitForAvailableVersion(driver, expectedVersion);
  } else {
    await selectChannel(driver, 'beta');
    await waitForAvailableVersion(driver, expectedVersion);
  }
  await waitForResultScreen(driver, resultsPath, `${screenshotPrefix}-available`);
  await click(driver, '[data-testid="update-download-button"]');
  await delay(2_000);
  try {
    await saveScreenshot(driver, resultsPath, `${screenshotPrefix}-download-started`);
  } catch (error) {
    appendLog(resultsPath, `download screen closed before screenshot: ${String(error)}`);
  }
  await waitFor(
    () => {
      try {
        return getAppVersionFromBundle(appPath) === expectedVersion;
      } catch {
        return false;
      }
    },
    `Updater did not install ${expectedVersion}`,
    180_000,
  );
  appendLog(resultsPath, `installed channel=${channel} version=${expectedVersion}`);
  await delay(5_000);
  const currentDriver = await reconnectDriver(driver, serverUrl, appPath, resultsPath);
  await visibleElement(currentDriver, '[data-testid="app-settings-view"]', 45_000).catch(
    async () => {
      await openSettings(currentDriver, resultsPath, `${screenshotPrefix}-after-restart`);
    },
  );
  await waitForResultScreen(currentDriver, resultsPath, `${screenshotPrefix}-restarted`);
  return currentDriver;
}

async function runAutomaticTests({
  resultsPath,
  releases,
  manifests,
  feedServer,
  appEnvironment,
  signature,
}) {
  const wdPort = await reservePort();
  const webDriverServer = await startWebDriver(appEnvironment, wdPort, resultsPath);
  let driver;
  try {
    const stable = releases.stable.initial;
    driver = await createWebDriver(webDriverServer.serverUrl, stable.appPath);
    await openSettings(driver, resultsPath, 'stable-before-update');
    driver = await applyUpdateAutomatically({
      driver,
      serverUrl: webDriverServer.serverUrl,
      appPath: stable.appPath,
      channel: 'stable',
      expectedVersion: releases.stable.candidate.version,
      resultsPath,
      screenshotPrefix: 'stable-update',
    });
    await click(driver, '[data-testid="update-check-button"]');
    await verifyNoUpdate(
      driver,
      releases.stable.candidate.version,
      stable.appPath,
      resultsPath,
      'stable-latest',
    );

    const beta = releases.beta.initial;
    await driver.quit().catch(() => undefined);
    driver = await createWebDriver(webDriverServer.serverUrl, beta.appPath);
    await openSettings(driver, resultsPath, 'beta-before-update');
    driver = await applyUpdateAutomatically({
      driver,
      serverUrl: webDriverServer.serverUrl,
      appPath: beta.appPath,
      channel: 'beta',
      expectedVersion: releases.beta.candidate.version,
      resultsPath,
      screenshotPrefix: 'beta-update',
    });
    manifests.set('stable', makeManifest(releases.stable.initial, feedServer.baseUrl));
    await selectChannel(driver, 'stable');
    await waitFor(
      async () =>
        (await driver.findElements(By.css('[data-testid="update-check-button"]'))).length > 0,
      'Switching Beta to old Stable feed returned an error or no result',
    );
    await verifyNoUpdate(
      driver,
      releases.beta.candidate.version,
      beta.appPath,
      resultsPath,
      'beta-stable-no-downgrade',
    );

    manifests.set(
      'beta',
      makeManifest(
        releases.beta.candidate,
        feedServer.baseUrl,
        TEST_RELEASES.beta.invalidVersion,
        tamperSignature(signature),
      ),
    );
    await selectChannel(driver, 'beta');
    await waitForAvailableVersion(driver, TEST_RELEASES.beta.invalidVersion);
    await waitForResultScreen(driver, resultsPath, 'invalid-signature-candidate');
    await click(driver, '[data-testid="update-download-button"]');
    await delay(2_000);
    try {
      await saveScreenshot(driver, resultsPath, 'invalid-signature-download-started');
    } catch (error) {
      appendLog(resultsPath, `invalid-signature screen closed before screenshot: ${String(error)}`);
    }
    await waitFor(async () => {
      const status = await driver.findElement(By.css('[data-testid="update-status"]'));
      return /signature verification|signature|署名の検証/i.test(await status.getText());
    }, 'Updater did not report rejection of the invalid update signature');
    await waitForResultScreen(driver, resultsPath, 'invalid-signature-rejected');
    assert.equal(
      getAppVersionFromBundle(beta.appPath),
      releases.beta.candidate.version,
      'Invalid updater signature changed the installed app version',
    );
    appendLog(resultsPath, 'all automatic updater scenarios passed');
    return { webDriverServer, driver };
  } catch (error) {
    appendLog(resultsPath, `automatic test failed: ${describeError(error)}`);
    try {
      if (driver) await saveScreenshot(driver, resultsPath, 'failure-screen');
    } catch (screenshotError) {
      appendLog(resultsPath, `failure screenshot failed: ${String(screenshotError)}`);
    }
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
      webDriverServer,
      driver,
    });
  }
}

async function runManualTests({
  readline,
  resultsPath,
  releases,
  manifests,
  feedServer,
  appEnvironment,
  signature,
}) {
  log('Starting manual updater tests. Follow each step and press Enter to continue.');
  const stable = releases.stable.initial;
  launchManualApp(stable.appPath, appEnvironment);
  log('Stable: Open Settings, check for 0.0.2 on the Stable channel, then install and restart.');
  appendLog(resultsPath, 'manual stable phase started');
  await confirmManualPass(
    readline,
    'Press Enter after updating to Stable 0.0.2 (enter n on failure)',
  );
  assert.equal(getAppVersionFromBundle(stable.appPath), releases.stable.candidate.version);
  log(
    'Stable 0.0.2 is confirmed in Info.plist. Check again on Stable and confirm no update is offered.',
  );
  await confirmManualPass(readline, 'Press Enter when the Stable recheck reports no update');
  appendLog(resultsPath, 'manual stable update and latest check confirmed');

  const beta = releases.beta.initial;
  log('Quit the Stable QA app before continuing.');
  await promptLine(readline, 'Press Enter after quitting the Stable QA app');
  launchManualApp(beta.appPath, appEnvironment);
  log(
    'Beta: Select the Beta channel in Settings to check automatically, then install 0.0.2-beta.2 and restart.',
  );
  appendLog(resultsPath, 'manual beta phase started');
  await confirmManualPass(readline, 'Press Enter after updating to Beta 0.0.2-beta.2');
  assert.equal(getAppVersionFromBundle(beta.appPath), releases.beta.candidate.version);
  manifests.set('stable', makeManifest(releases.stable.initial, feedServer.baseUrl));
  log('Beta to Stable: Select Stable and confirm there is no error or downgrade.');
  await confirmManualPass(
    readline,
    'Press Enter after switching to Stable and confirming no update',
  );
  assert.equal(getAppVersionFromBundle(beta.appPath), releases.beta.candidate.version);

  manifests.set(
    'beta',
    makeManifest(
      releases.beta.candidate,
      feedServer.baseUrl,
      TEST_RELEASES.beta.invalidVersion,
      tamperSignature(signature),
    ),
  );
  log(
    'Invalid signature: Switch back to Beta. A fake 0.0.3-beta.1 candidate should appear; try installing it and confirm rejection.',
  );
  await confirmManualPass(
    readline,
    'Press Enter only after seeing the signature error and unchanged version (enter n if either check fails)',
  );
  assert.equal(getAppVersionFromBundle(beta.appPath), releases.beta.candidate.version);
  log('Quit the Beta QA app before finishing.');
  await promptLine(readline, 'Press Enter after quitting the test app');
  appendLog(resultsPath, 'all manual updater scenarios confirmed');
}

async function main() {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  let runtimePath;
  let resultsPath;
  let feedServer;
  let webDriverServer;
  let driver;
  let failed = false;
  let succeeded = false;
  const onSigint = () => abortForSignal('SIGINT', readline, resultsPath);
  const onSigterm = () => abortForSignal('SIGTERM', readline, resultsPath);
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);
  try {
    const mode = await chooseMode(readline);
    assertMacArm64();
    assertCommandAvailable('bun', ['--version']);
    if (mode === 'auto') assertCommandAvailable('tauri-wd');
    const runId = `${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}-${randomUUID().slice(0, 8)}`;
    resultsPath = path.join(projectRoot, 'test-results', 'updater-local', runId);
    mkdirSync(resultsPath, { recursive: true });
    activeResultsPath = resultsPath;
    writeFileSync(path.join(resultsPath, 'run.log'), `mode=${mode}\n`);
    runtimePath = runtimeDirectoryFor(resultsPath);
    mkdirSync(runtimePath, { recursive: true });
    const port = await reservePort();
    const keyPair = generateTestKeyPair(runtimePath);
    const manifests = new Map();
    const assets = new Map();
    feedServer = await startFeedServer({ port, manifests, assets, resultsPath });
    const qaHome = path.join(runtimePath, 'home');
    const qaTemporary = path.join(runtimePath, 'tmp');
    const buildEnvironment = createUpdaterBuildEnvironment(process.env, keyPair.keyPath);
    mkdirSync(qaHome, { recursive: true });
    mkdirSync(qaTemporary, { recursive: true });
    const appEnvironment = {
      ...withoutAppleSigningEnvironment(process.env),
      HOME: qaHome,
      TMPDIR: qaTemporary,
      CI: '1',
    };
    delete appEnvironment.TAURI_SIGNING_PRIVATE_KEY;
    delete appEnvironment.TAURI_SIGNING_PRIVATE_KEY_PASSWORD;
    delete appEnvironment.TAURI_SIGNING_PRIVATE_KEY_PATH;

    log(`Preparing test builds. Diagnostics: ${path.relative(projectRoot, resultsPath)}`);
    appendLog(resultsPath, `run=${runId} mode=${mode} target=${tauriTarget}`);
    const releases = {
      stable: {
        initial: await buildVersion({
          release: TEST_RELEASES.stable,
          version: TEST_RELEASES.stable.initialVersion,
          pubkey: keyPair.pubkey,
          port,
          testRoot: runtimePath,
          buildEnvironment,
          resultsPath,
        }),
        candidate: null,
      },
      beta: { initial: null, candidate: null },
    };
    releases.stable.candidate = await buildVersion({
      release: TEST_RELEASES.stable,
      version: TEST_RELEASES.stable.candidateVersion,
      pubkey: keyPair.pubkey,
      port,
      testRoot: runtimePath,
      buildEnvironment,
      resultsPath,
    });
    releases.beta.initial = await buildVersion({
      release: TEST_RELEASES.beta,
      version: TEST_RELEASES.beta.initialVersion,
      pubkey: keyPair.pubkey,
      port,
      testRoot: runtimePath,
      buildEnvironment,
      resultsPath,
    });
    releases.beta.candidate = await buildVersion({
      release: TEST_RELEASES.beta,
      version: TEST_RELEASES.beta.candidateVersion,
      pubkey: keyPair.pubkey,
      port,
      testRoot: runtimePath,
      buildEnvironment,
      resultsPath,
    });

    const baseUrl = feedServer.baseUrl;
    assertLoopbackHttpUrl(baseUrl);
    manifests.set('stable', makeManifest(releases.stable.candidate, baseUrl));
    manifests.set('beta', makeManifest(releases.beta.candidate, baseUrl));
    for (const release of Object.values(releases)) {
      for (const build of Object.values(release)) {
        if (!build) continue;
        assets.set(`/assets/${build.assetName}`, readFileSync(build.assetCopyPath));
      }
    }
    if (mode === 'auto') {
      try {
        const result = await runAutomaticTests({
          resultsPath,
          releases,
          manifests,
          feedServer,
          appEnvironment,
          signature: releases.beta.candidate.signature,
        });
        webDriverServer = result.webDriverServer;
        driver = result.driver;
      } catch (error) {
        webDriverServer = error.webDriverServer;
        driver = error.driver;
        throw error;
      }
    } else {
      await runManualTests({
        readline,
        resultsPath,
        releases,
        manifests,
        feedServer,
        appEnvironment,
        signature: releases.beta.candidate.signature,
      });
    }
    succeeded = true;
    log('All local updater scenarios passed. Screenshots and logs have been retained.');
  } catch (error) {
    failed = true;
    const message = describeError(error);
    if (resultsPath) appendLog(resultsPath, `failure ${message}`);
    process.stderr.write(`\n[updater-local] FAILED\n${message}\n`);
    if (resultsPath) log(`Diagnostics retained: ${path.relative(projectRoot, resultsPath)}`);
  } finally {
    await feedServer?.close().catch((error) => {
      if (resultsPath) appendLog(resultsPath, `feed shutdown error: ${String(error)}`);
    });
    if (driver) {
      await Promise.race([driver.quit().catch(() => undefined), delay(2_500)]);
    }
    if (webDriverServer?.child && webDriverServer.child.exitCode === null) {
      webDriverServer.child.kill('SIGTERM');
      await Promise.race([once(webDriverServer.child, 'exit'), delay(1_500)]);
      if (webDriverServer.child.exitCode === null) webDriverServer.child.kill('SIGKILL');
    }
    try {
      await terminateRunningQaApps(runtimePath, resultsPath);
    } catch (error) {
      if (resultsPath) appendLog(resultsPath, `QA app shutdown failed: ${String(error)}`);
    }
    try {
      cleanupQaBundleArtifacts(resultsPath);
    } catch (error) {
      if (resultsPath) appendLog(resultsPath, `QA bundle cleanup failed: ${String(error)}`);
      failed = true;
    }
    if (runtimePath && existsSync(runtimePath)) {
      try {
        cleanupRuntimeDirectory(resultsPath);
      } catch (error) {
        if (resultsPath) appendLog(resultsPath, `temporary cleanup failed: ${String(error)}`);
        failed = true;
      }
    }
    readline.close();
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
  }
  if (resultsPath) {
    appendLog(resultsPath, succeeded ? 'result=passed' : 'result=failed');
    log(`Run log: ${path.relative(projectRoot, path.join(resultsPath, 'run.log'))}`);
  }
  if (receivedSignal === 'SIGINT') process.exitCode = 130;
  else if (receivedSignal === 'SIGTERM') process.exitCode = 143;
  else if (failed) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  void main();
}
