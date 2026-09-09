import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { Builder, By } from 'selenium-webdriver';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const platform = process.platform;
const isMac = platform === 'darwin';
const isWindows = platform === 'win32';
const serverId = 'real-e2e-server';
const backupName = 'real-e2e-backup.zip';
const originalProperties = 'online-mode=true\nmotd=real-e2e\n';
const originalLevel = 'original-level-data';

function logStep(message) {
  console.log(`[real-tauri-e2e] ${message}`);
}

function platformBinaryPath(root) {
  return path.join(root, 'src-tauri', 'target', 'debug', isWindows ? 'mc-vector.exe' : 'mc-vector');
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? projectRoot,
      env: options.env ?? process.env,
      stdio: options.stdio ?? 'inherit',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with ${signal ?? `code ${code}`}`));
    });
  });
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) {
    return;
  }
  child.kill('SIGTERM');
  await Promise.race([once(child, 'exit'), delay(1500)]);
  if (child.exitCode === null) {
    child.kill('SIGKILL');
    await Promise.race([once(child, 'exit'), delay(1500)]);
  }
}

async function waitFor(predicate, message, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await predicate();
      if (result) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  const detail = lastError instanceof Error ? `: ${lastError.message}` : '';
  throw new Error(`${message}${detail}`);
}

async function waitForDriverServer(url, child) {
  await waitFor(
    async () => {
      if (child.exitCode !== null) {
        throw new Error('WebDriver process exited before becoming ready');
      }
      try {
        const response = await fetch(`${url}/status`);
        return response.ok;
      } catch {
        return false;
      }
    },
    `WebDriver did not become ready at ${url}`,
    15_000,
  );
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  if (!port) {
    throw new Error('Could not reserve a local WebDriver port');
  }
  return port;
}

function assertCommandAvailable(command) {
  const result = spawnSync(command, ['--help'], {
    stdio: 'ignore',
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `Missing real Tauri E2E prerequisite: ${command}. ` +
        (isMac
          ? 'Install it with: cargo install tauri-webdriver-automation --locked'
          : 'Install tauri-driver for the current OS before running this command.'),
    );
  }
}

function createTestEnvironment(testRoot) {
  const home = path.join(testRoot, 'home');
  const appData = path.join(testRoot, 'app-data');
  const config = path.join(testRoot, 'config');
  const temp = path.join(testRoot, 'tmp');
  for (const directory of [home, appData, config, temp]) {
    mkdirSync(directory, { recursive: true });
  }

  return {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    APPDATA: appData,
    LOCALAPPDATA: appData,
    XDG_DATA_HOME: appData,
    XDG_CONFIG_HOME: config,
    TMPDIR: temp,
    MC_VECTOR_E2E: '1',
  };
}

function appDataDirectory(environment, identifier) {
  if (isMac) {
    return path.join(environment.HOME, 'Library', 'Application Support', identifier);
  }
  if (isWindows) {
    return path.join(environment.APPDATA, identifier);
  }
  return path.join(environment.XDG_DATA_HOME, identifier);
}

function createFixture(environment, identifier) {
  const appDataDir = appDataDirectory(environment, identifier);
  const serverPath = path.join(appDataDir, 'servers', serverId);
  mkdirSync(path.join(serverPath, 'world'), { recursive: true });
  mkdirSync(path.join(serverPath, 'plugins'), { recursive: true });
  mkdirSync(path.join(appDataDir, 'java'), { recursive: true });

  writeFileSync(path.join(serverPath, 'server.properties'), originalProperties);
  writeFileSync(path.join(serverPath, 'world', 'level.dat'), originalLevel);
  writeFileSync(path.join(serverPath, 'plugins', 'fixture.txt'), 'fixture-plugin');
  writeFileSync(path.join(serverPath, 'eula.txt'), 'eula=true\n');
  writeFileSync(path.join(serverPath, 'server.jar'), 'not-a-real-jar');

  let javaPath = 'java.exe';
  if (!isWindows) {
    javaPath = path.join(appDataDir, 'java', 'java');
    writeFileSync(
      javaPath,
      '#!/bin/sh\ntrap "exit 0" TERM INT\nwhile IFS= read -r line; do\n  if [ "$line" = "stop" ]; then exit 0; fi\ndone\n',
    );
    chmodSync(javaPath, 0o755);
  }

  const server = {
    id: serverId,
    name: 'Real E2E Server',
    version: '1.21.8',
    software: 'Paper',
    port: 25565,
    memory: 256,
    path: serverPath,
    status: 'offline',
    javaPath,
    autoBackupEnabled: false,
    backupRestartAfterSafeBackup: true,
    createdDate: new Date().toISOString(),
  };
  mkdirSync(appDataDir, { recursive: true });
  writeFileSync(path.join(appDataDir, 'servers.json'), JSON.stringify({ servers: [server] }, null, 2));

  return { appDataDir, serverPath, server };
}

async function buildDebugBinary(identifier, configPath, environment) {
  if (process.env.MC_VECTOR_TAURI_E2E_SKIP_BUILD !== '1') {
    const pnpm = isWindows ? 'pnpm.cmd' : 'pnpm';
    await runProcess(
      pnpm,
      [
        'exec',
        'tauri',
        'build',
        '--debug',
        '--no-bundle',
        '--no-sign',
        '--config',
        configPath,
      ],
      { env: process.env },
    );
  }

  const binary = platformBinaryPath(projectRoot);
  if (!existsSync(binary)) {
    throw new Error(`Unsigned debug Tauri binary was not produced for ${identifier}: ${binary}`);
  }
  return binary;
}

async function startWebDriver(environment, port) {
  const command = isMac ? 'tauri-wd' : 'tauri-driver';
  assertCommandAvailable(command);
  const child = spawn(command, ['--port', String(port), '--log-level', 'debug'], {
    cwd: projectRoot,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const output = [];
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => {
      output.push(chunk.toString());
      if (process.env.MC_VECTOR_TAURI_E2E_VERBOSE === '1') {
        process.stderr.write(chunk);
      }
      if (output.length > 40) {
        output.shift();
      }
    });
  }
  const url = `http://127.0.0.1:${port}`;
  try {
    await waitForDriverServer(url, child);
  } catch (error) {
    await stopProcess(child);
    const recentOutput = output.join('').trim();
    throw new Error(`${error.message}${recentOutput ? `\n${recentOutput}` : ''}`);
  }
  return { child, url };
}

async function createWebDriver(serverUrl, binary) {
  const capabilities = {
    browserName: isMac ? 'tauri' : 'wry',
    platformName: isMac ? 'mac' : isWindows ? 'windows' : 'linux',
    'tauri:options': isMac ? { binary } : { application: binary },
  };
  const driver = await new Builder()
    .usingServer(serverUrl)
    .withCapabilities(capabilities)
    .build();
  await driver.manage().setTimeouts({ implicit: 500, pageLoad: 10_000, script: 15_000 });
  return driver;
}

async function visibleElement(driver, selector, timeoutMs = 30_000) {
  return waitFor(
    () => driver.findElement(By.css(selector)),
    `${selector} is not visible`,
    timeoutMs,
  );
}

async function click(driver, selector) {
  const element = await visibleElement(driver, selector);
  await waitFor(() => element.isEnabled(), `${selector} is not enabled`);
  await element.click();
}

async function setReactInputValue(driver, selector, value) {
  const selectorJson = JSON.stringify(selector);
  const valueJson = JSON.stringify(value);
  const actualValue = await driver.executeScript(`
    const element = document.querySelector(${selectorJson});
    if (!element) throw new Error('Input not found: ' + ${selectorJson});
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    ).set;
    setter.call(element, ${valueJson});
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return element.value;
  `);
  assert.equal(actualValue, value, `React input did not accept value for ${selector}`);
}

async function openBackups(driver) {
  await visibleElement(driver, '[data-testid="app-root"]');
  await click(driver, `[data-testid="server-card-${serverId}"]`);
  await click(driver, '[data-testid="nav-item-backups"]');
  await visibleElement(driver, '[data-testid="backups-view"]');
}

async function createBackupThroughUi(driver, serverPath) {
  await click(driver, '[data-testid="backups-create-button"]');
  const nameInput = await visibleElement(driver, '[data-testid="backup-name-input"]');
  await nameInput.click();
  await setReactInputValue(driver, '[data-testid="backup-name-input"]', backupName);
  const submit = await visibleElement(driver, '[data-testid="backups-create-submit"]');
  await waitFor(() => submit.isEnabled(), 'Full backup submit button stayed disabled');
  await submit.click();
  try {
    await visibleElement(driver, `[data-testid="backup-row-${backupName}"]`, 60_000);
  } catch (error) {
    const bodyText = await driver
      .executeScript('return document.body?.innerText ?? "";')
      .catch(() => '<unavailable>');
    const backupDirectory = path.join(path.dirname(serverPath), '..', 'backups', serverId);
    const backupEntries = existsSync(backupDirectory)
      ? readdirSync(backupDirectory, {
          withFileTypes: true,
        }).map((entry) => entry.name)
      : [];
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\n` +
        `UI after create:\n${bodyText}\n` +
        `Backup directory entries: ${backupEntries.join(', ') || '<empty>'}`,
    );
  }

  const backupDirectory = path.join(path.dirname(serverPath), '..', 'backups', serverId);
  const archivePath = path.join(backupDirectory, backupName);
  await waitFor(() => existsSync(archivePath), `Backup archive was not created: ${archivePath}`, 60_000);
  return archivePath;
}

async function restoreThroughUi(driver, expectedFileContent) {
  const row = await visibleElement(driver, `[data-testid="backup-row-${backupName}"]`);
  const restoreButton = await row.findElement(By.css('button'));
  await waitFor(() => restoreButton.isEnabled(), 'Restore button is not enabled');
  await restoreButton.click();
  return waitFor(
    () => readFileSync(expectedFileContent.path, 'utf8') === expectedFileContent.value,
    'Restore did not update the real server directory',
    60_000,
  );
}

async function waitForToast(driver, text) {
  await waitFor(
    async () => {
      const bodyText = await driver.executeScript('return document.body?.innerText ?? "";');
      return bodyText.includes(text);
    },
    `Expected toast was not shown: ${text}`,
    15_000,
  );
}

function readZipEntry(archivePath, entryName) {
  const command = isWindows ? 'tar.exe' : 'unzip';
  const args = isWindows
    ? ['-xOf', archivePath, entryName]
    : ['-p', archivePath, entryName];
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) {
    throw new Error(`Could not read ${entryName} from ${archivePath}: ${result.stderr ?? result.error}`);
  }
  return result.stdout;
}

async function main() {
  const testRoot = mkdtempSync(path.join(os.tmpdir(), 'mc-vector-tauri-e2e-'));
  let normalDriver;
  let normalWebDriver;
  let failureDriver;
  let failureWebDriver;
  try {
    const identifier = 'com.tukuyomi032.mcvector.e2e';
    const environment = createTestEnvironment(testRoot);
    const configPath = path.join(testRoot, 'tauri.e2e.conf.json');
    writeFileSync(
      configPath,
      JSON.stringify({ identifier, productName: 'MC-Vector E2E' }, null, 2),
    );
    const fixture = createFixture(environment, identifier);
    logStep(`fixture ready (${identifier})`);
    const binary = await buildDebugBinary(identifier, configPath, environment);
    logStep(`debug binary ready (${binary})`);

    normalDriver = await startWebDriver(environment, await reservePort());
    logStep('WebDriver ready');
    normalWebDriver = await createWebDriver(normalDriver.url, binary);
    await openBackups(normalWebDriver);
    logStep('real application loaded');

    const archivePath = await createBackupThroughUi(normalWebDriver, fixture.serverPath);
    logStep('full backup created through UI');
    const manifest = JSON.parse(readZipEntry(archivePath, 'manifest.json'));
    assert.equal(manifest.formatVersion, 2);
    assert.equal(manifest.serverId, serverId);
    assert.equal(manifest.kind, 'full');
    assert.equal(manifest.consistency, 'quiesced');
    assert.ok(manifest.entries.some((entry) => entry.path === 'server.properties'));
    assert.ok(manifest.entries.some((entry) => entry.path === 'world/level.dat'));

    const backupDirectory = path.dirname(archivePath);
    const catalogPath = path.join(backupDirectory, '.mc-vector-backup-catalog.json');
    const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
    assert.equal(catalog.serverId, serverId);
    assert.equal(catalog.records.length, 1);
    assert.equal(catalog.records[0].archivePath, backupName);
    assert.equal(catalog.records[0].restoreEligible, true);

    const propertiesPath = path.join(fixture.serverPath, 'server.properties');
    const levelPath = path.join(fixture.serverPath, 'world', 'level.dat');
    writeFileSync(propertiesPath, 'mutated-properties');
    writeFileSync(levelPath, 'mutated-level-data');
    writeFileSync(path.join(fixture.serverPath, 'stale-after-backup.txt'), 'must disappear');
    await restoreThroughUi(normalWebDriver, { path: propertiesPath, value: originalProperties });
    assert.equal(readFileSync(levelPath, 'utf8'), originalLevel);
    assert.equal(existsSync(path.join(fixture.serverPath, 'stale-after-backup.txt')), false);
    await waitForToast(normalWebDriver, 'Restore completed!');
    logStep('full restore and manifest verification passed');

    await click(normalWebDriver, '[data-testid="server-start-button"]');
    await waitFor(
      async () => (await visibleElement(normalWebDriver, `[data-testid="server-stop-button"]`)).isEnabled(),
      'Fixture server did not enter the running state',
      30_000,
    );
    logStep('running-server guard passed');
    await restoreThroughUi(normalWebDriver, { path: propertiesPath, value: originalProperties });
    await waitForToast(normalWebDriver, 'Failed to restore backup');
    assert.equal(readFileSync(propertiesPath, 'utf8'), originalProperties);
    await click(normalWebDriver, '[data-testid="server-stop-button"]');
    await waitFor(
      async () => (await visibleElement(normalWebDriver, '[data-testid="server-start-button"]')).isEnabled(),
      'Fixture server did not stop cleanly',
      30_000,
    );
    logStep('fixture server stopped');

    await normalWebDriver.quit();
    normalWebDriver = undefined;
    await delay(500);
    normalWebDriver = await createWebDriver(normalDriver.url, binary);
    await openBackups(normalWebDriver);
    await visibleElement(normalWebDriver, `[data-testid="backup-row-${backupName}"]`);
    logStep('catalog reload after app restart passed');

    writeFileSync(propertiesPath, 'failure-mutated-properties');
    writeFileSync(path.join(fixture.serverPath, 'stale-before-injected-failure.txt'), 'must remain');
    const failureEnvironment = {
      ...environment,
      MC_VECTOR_TEST_RESTORE_FAILURE: 'after-current-rename',
    };
    await normalWebDriver.quit();
    normalWebDriver = undefined;
    await stopProcess(normalDriver.child);
    normalDriver = undefined;

    failureDriver = await startWebDriver(failureEnvironment, await reservePort());
    failureWebDriver = await createWebDriver(failureDriver.url, binary);
    await openBackups(failureWebDriver);
    const failureRow = await visibleElement(failureWebDriver, `[data-testid="backup-row-${backupName}"]`);
    await failureRow.findElement(By.css('button')).click();
    await waitForToast(failureWebDriver, 'Failed to restore backup');
    assert.equal(readFileSync(propertiesPath, 'utf8'), 'failure-mutated-properties');
    assert.equal(existsSync(path.join(fixture.serverPath, 'stale-before-injected-failure.txt')), true);
    const leftovers = readdirSync(path.dirname(fixture.serverPath));
    assert.equal(
      leftovers.some(
        (entry) =>
          entry.startsWith('.mc-vector-restore-staging-') || entry.startsWith('.mc-vector-restore-rollback-'),
      ),
      false,
    );
    logStep('injected restore failure rollback passed');

    console.log(`Real Tauri smoke E2E passed on ${platform}`);
  } finally {
    await failureWebDriver?.quit().catch(() => undefined);
    await normalWebDriver?.quit().catch(() => undefined);
    await stopProcess(failureDriver?.child);
    await stopProcess(normalDriver?.child);
    rmSync(testRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
