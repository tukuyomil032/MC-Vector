import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { createServer } from 'node:http';
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
const importedFixtureContent = 'imported through the real Tauri E2E fixture\n';
const pluginFixtureContent = 'verified local plugin fixture\n';

function logStep(message) {
  console.log(`[real-tauri-e2e] ${message}`);
}

function describeError(error) {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

function errorFingerprint(error) {
  return createHash('sha256').update(describeError(error)).digest('hex').slice(0, 12);
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

function powershellLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function createJavaFixtureArchive(testRoot) {
  const javaRoot = path.join(testRoot, 'java-fixture', 'temurin-e2e');
  const javaRelativePath = isMac
    ? path.join('Contents', 'Home', 'bin', 'java')
    : path.join('bin', 'java.exe');
  const javaFixturePath = path.join(javaRoot, javaRelativePath);
  mkdirSync(path.dirname(javaFixturePath), { recursive: true });
  writeFileSync(javaFixturePath, 'fixture java runtime\n');
  if (!isWindows) {
    chmodSync(javaFixturePath, 0o755);
  }

  const archivePath = path.join(testRoot, isWindows ? 'java-fixture.zip' : 'java-fixture.tar.gz');
  if (isWindows) {
    await runProcess('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Compress-Archive -LiteralPath ${powershellLiteral(javaRoot)} -DestinationPath ${powershellLiteral(archivePath)} -Force`,
    ]);
  } else {
    await runProcess('tar', [
      '-czf',
      archivePath,
      '-C',
      path.dirname(javaRoot),
      path.basename(javaRoot),
    ]);
  }

  const body = readFileSync(archivePath);
  return {
    body,
    checksum: createHash('sha256').update(body).digest('hex'),
    size: body.length,
    path: isWindows ? '/java.zip' : '/java.tar.gz',
  };
}

async function startArtifactFixture(javaFixture) {
  const body = Buffer.from(pluginFixtureContent, 'utf8');
  const checksum = createHash('sha256').update(body).digest('hex');
  const server = createServer((request, response) => {
    if (request.url === javaFixture.path) {
      response.writeHead(200, {
        'content-length': String(javaFixture.size),
        'content-type': isWindows ? 'application/zip' : 'application/gzip',
      });
      response.end(javaFixture.body);
      return;
    }
    if (request.url !== '/plugin.jar') {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'content-length': String(body.length),
      'content-type': 'application/java-archive',
    });
    response.end(body);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (typeof address !== 'object' || !address) {
    server.close();
    throw new Error('Could not start local artifact fixture');
  }
  return {
    checksum,
    url: `http://127.0.0.1:${address.port}/plugin.jar`,
    javaChecksum: javaFixture.checksum,
    javaSize: javaFixture.size,
    javaUrl: `http://127.0.0.1:${address.port}${javaFixture.path}`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
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
    VITE_MC_VECTOR_E2E: '1',
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

async function createFixture(environment, identifier, testRoot) {
  const appDataDir = appDataDirectory(environment, identifier);
  const serverPath = path.join(appDataDir, 'servers', serverId);
  mkdirSync(path.join(serverPath, 'world'), { recursive: true });
  mkdirSync(path.join(serverPath, 'plugins'), { recursive: true });
  mkdirSync(path.join(appDataDir, 'java'), { recursive: true });

  writeFileSync(path.join(serverPath, 'server.properties'), originalProperties);
  writeFileSync(path.join(serverPath, 'world', 'level.dat'), originalLevel);
  writeFileSync(path.join(serverPath, 'plugins', 'fixture.txt'), 'fixture-plugin');
  writeFileSync(path.join(serverPath, 'server.jar'), 'not-a-real-jar');

  const javaPath = path.join(appDataDir, 'java', isWindows ? 'java.exe' : 'java');
  const commandLog = path.join(testRoot, 'fixture-server-commands.log');
  environment.MC_VECTOR_E2E_COMMAND_LOG = commandLog;
  if (!isWindows) {
    writeFileSync(
      javaPath,
      '#!/bin/sh\nprintf "fixture-ready\\n"\ntrap "exit 0" TERM INT\nwhile IFS= read -r line; do\n  printf "%s\\n" "$line" >> "$MC_VECTOR_E2E_COMMAND_LOG"\n  printf "fixture-command:%s\\n" "$line"\n  if [ "$line" = "stop" ]; then exit 0; fi\ndone\n',
    );
    chmodSync(javaPath, 0o755);
  } else {
    const javaSource = path.join(testRoot, 'fixture-java.rs');
    writeFileSync(
      javaSource,
      [
        'use std::{env, fs::OpenOptions, io::{self, BufRead, Write}};',
        'fn main() {',
        '  println!("fixture-ready");',
        '  let log = env::var("MC_VECTOR_E2E_COMMAND_LOG").expect("command log");',
        '  for line in io::stdin().lock().lines() {',
        '    let line = line.expect("stdin");',
        '    writeln!(OpenOptions::new().create(true).append(true).open(&log).expect("log"), "{}", line).expect("write");',
        '    println!("fixture-command:{}", line);',
        '    if line == "stop" { break; }',
        '  }',
        '}',
      ].join('\n'),
    );
    await runProcess('rustc', [javaSource, '-O', '-o', javaPath]);
  }

  const importSource = path.join(testRoot, 'external-import-fixture.txt');
  writeFileSync(importSource, importedFixtureContent);
  environment.MC_VECTOR_E2E_IMPORT_SOURCE = importSource;

  const ngrokDirectory = path.join(appDataDir, 'ngrok');
  mkdirSync(ngrokDirectory, { recursive: true });
  const ngrokPath = path.join(ngrokDirectory, isWindows ? 'ngrok.exe' : 'ngrok');
  if (!isWindows) {
    writeFileSync(
      ngrokPath,
      '#!/bin/sh\nprintf "lvl=info msg=tunnel url=tcp://127.0.0.1:25565\\n"\ntrap "exit 0" TERM INT\nwhile :; do sleep 1; done\n',
    );
    chmodSync(ngrokPath, 0o755);
  } else {
    const ngrokSource = path.join(testRoot, 'fixture-ngrok.rs');
    writeFileSync(
      ngrokSource,
      [
        'use std::{io::Write, thread, time::Duration};',
        'fn main() {',
        '  println!("lvl=info msg=tunnel url=tcp://127.0.0.1:25565");',
        '  let _ = std::io::stdout().flush();',
        '  loop { thread::sleep(Duration::from_secs(1)); }',
        '}',
      ].join('\n'),
    );
    await runProcess('rustc', [ngrokSource, '-O', '-o', ngrokPath]);
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
  writeFileSync(
    path.join(appDataDir, 'servers.json'),
    JSON.stringify({ servers: [server] }, null, 2),
  );

  return { appDataDir, serverPath, server, commandLog, importSource };
}

async function buildDebugBinary(identifier, configPath, environment) {
  if (process.env.MC_VECTOR_TAURI_E2E_SKIP_BUILD !== '1') {
    const bun = isWindows ? 'bun.exe' : 'bun';
    const buildEnvironment = {
      ...process.env,
      MC_VECTOR_E2E: '1',
      VITE_MC_VECTOR_E2E: '1',
      VITE_MC_VECTOR_E2E_BUILD: 'debug',
      VITE_MC_VECTOR_E2E_PLUGIN_URL: environment.VITE_MC_VECTOR_E2E_PLUGIN_URL,
      VITE_MC_VECTOR_E2E_PLUGIN_SHA256: environment.VITE_MC_VECTOR_E2E_PLUGIN_SHA256,
    };
    await runProcess(
      bun,
      ['run', 'tauri', 'build', '--debug', '--no-bundle', '--no-sign', '--config', configPath],
      { env: buildEnvironment },
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
  return { child, url, output };
}

async function createWebDriver(serverUrl, binary) {
  const capabilities = {
    browserName: isMac ? 'tauri' : 'wry',
    platformName: isMac ? 'mac' : isWindows ? 'windows' : 'linux',
    'tauri:options': isMac ? { binary } : { application: binary },
  };
  const driver = await new Builder().usingServer(serverUrl).withCapabilities(capabilities).build();
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

async function invoke(driver, command, args = {}) {
  const result = await driver.executeAsyncScript(
    `
      const done = arguments[arguments.length - 1];
      window.__TAURI_INTERNALS__.invoke(arguments[0], arguments[1])
        .then((value) => done({ ok: true, value }))
        .catch((error) => done({ ok: false, error: String(error) }));
    `,
    command,
    args,
  );
  if (!result?.ok) {
    throw new Error(`Tauri IPC ${command} failed: ${result?.error ?? 'unknown error'}`);
  }
  return result.value;
}

async function openBackups(driver) {
  await visibleElement(driver, '[data-testid="app-root"]');
  await click(driver, `[data-testid="server-card-${serverId}"]`);
  await click(driver, '[data-testid="nav-item-backups"]');
  await visibleElement(driver, '[data-testid="backups-view"]');
}

async function openServerView(driver, view) {
  await click(driver, `[data-testid="server-card-${serverId}"]`);
  await click(driver, `[data-testid="nav-item-${view}"]`);
}

async function exerciseLifecycle(driver, fixture) {
  await click(driver, '[data-testid="server-start-button"]');
  await visibleElement(driver, '[data-testid="server-eula-modal"]');
  await click(driver, '[data-testid="server-eula-checkbox"]');
  await click(driver, '[data-testid="server-eula-accept"]');
  await waitFor(
    async () => (await visibleElement(driver, '[data-testid="server-stop-button"]')).isEnabled(),
    'Fixture server did not enter the running state after EULA acceptance',
  );
  assert.equal(readFileSync(path.join(fixture.serverPath, 'eula.txt'), 'utf8'), 'eula=true\n');

  await openServerView(driver, 'console');
  await visibleElement(driver, '[data-testid="console-view"]');
  await setReactInputValue(driver, '[data-testid="console-command-input"]', 'say real-e2e');
  await click(driver, '[data-testid="console-send-button"]');
  await waitFor(
    () =>
      existsSync(fixture.commandLog) &&
      readFileSync(fixture.commandLog, 'utf8').includes('say real-e2e'),
    'Console command did not reach the fixture Java process',
  );
  await waitFor(
    async () =>
      (await driver.executeScript('return document.body?.innerText ?? "";')).includes(
        'fixture-command:say real-e2e',
      ),
    'Fixture Java output did not return through the console event stream',
  );

  await click(driver, '[data-testid="server-stop-button"]');
  await waitFor(
    async () => (await visibleElement(driver, '[data-testid="server-start-button"]')).isEnabled(),
    'Fixture server did not stop cleanly after the stop command',
  );
}

async function exerciseFilesAndSettings(driver, fixture) {
  await openServerView(driver, 'files');
  await visibleElement(driver, '[data-testid="files-view"]');
  await click(driver, '[data-testid="files-create-button"]');
  await click(driver, '[data-testid="files-create-file-option"]');
  await setReactInputValue(driver, '[data-testid="files-name-input"]', 'ui-created.txt');
  await click(driver, '[data-testid="files-create-submit"]');
  const createdPath = path.join(fixture.serverPath, 'ui-created.txt');
  await waitFor(
    () => existsSync(createdPath),
    'UI-created file was not written to managed storage',
  );

  await visibleElement(driver, '[data-testid="file-row-ui-created.txt"]');
  const createdRequest = {
    root: 'servers',
    serverId,
    relativePath: 'ui-created.txt',
  };
  assert.equal(await invoke(driver, 'read_managed_text_file', { request: createdRequest }), '');
  await invoke(driver, 'write_managed_text_file', {
    request: createdRequest,
    content: 'saved through the real Tauri file command',
  });
  await waitFor(
    () => readFileSync(createdPath, 'utf8').includes('saved through the real Tauri file command'),
    'Real Tauri file command did not update the managed file',
  );

  await click(driver, '[data-testid="files-create-button"]');
  await click(driver, '[data-testid="files-import-button"]');
  const importedPath = path.join(fixture.serverPath, path.basename(fixture.importSource));
  await waitFor(() => existsSync(importedPath), 'Debug E2E import fixture was not committed');
  assert.equal(readFileSync(importedPath, 'utf8'), importedFixtureContent);
  const bodyText = await driver.executeScript('return document.body?.innerText ?? "";');
  assert.equal(
    bodyText.includes(fixture.importSource),
    false,
    'Import source path leaked to renderer DOM',
  );

  await invoke(driver, 'move_managed_path', {
    from: { root: 'servers', serverId, relativePath: 'ui-created.txt' },
    to: { root: 'servers', serverId, relativePath: 'moved-ui-created.txt' },
  });
  const movedPath = path.join(fixture.serverPath, 'moved-ui-created.txt');
  await waitFor(
    () => existsSync(movedPath) && !existsSync(createdPath),
    'Managed file move failed',
  );
  await invoke(driver, 'delete_managed_path', {
    request: { root: 'servers', serverId, relativePath: 'moved-ui-created.txt' },
  });
  await waitFor(() => !existsSync(movedPath), 'Managed file delete failed');

  await openServerView(driver, 'general-settings');
  await visibleElement(driver, '[data-testid="server-settings-view"]');
  await setReactInputValue(
    driver,
    '[data-testid="server-settings-name-input"]',
    'Persisted Real E2E Server',
  );
  await click(driver, '[data-testid="server-settings-save-button"]');
  await waitFor(
    () =>
      readFileSync(path.join(fixture.appDataDir, 'servers.json'), 'utf8').includes(
        'Persisted Real E2E Server',
      ),
    'Server settings were not persisted to real app storage',
  );
}

async function exerciseVerifiedArtifact(driver, fixture, artifact) {
  await openServerView(driver, 'plugins');
  await visibleElement(driver, '[data-testid="plugin-browser"]');
  await visibleElement(driver, '[data-testid="plugin-result-e2e-verified-plugin"]');
  await click(driver, '[data-testid="plugin-install-e2e-verified-plugin"]');

  const destination = path.join(fixture.serverPath, 'plugins', 'e2e-verified-plugin.jar');
  await waitFor(
    () => existsSync(destination),
    'Plugin Browser did not install the fixture artifact',
  );
  assert.equal(readFileSync(destination, 'utf8'), pluginFixtureContent);

  const request = {
    url: artifact.url,
    serverId,
    relativePath: 'plugins/e2e-verified-plugin.jar',
    provider: 'modrinth',
    checksum: { algorithm: 'sha256', value: artifact.checksum },
    eventId: 'real-e2e-verified-artifact',
  };

  await assert.rejects(
    () =>
      invoke(driver, 'download_plugin_artifact', {
        request: {
          ...request,
          checksum: { algorithm: 'sha256', value: '0'.repeat(64) },
          eventId: 'real-e2e-checksum-mismatch',
        },
      }),
    /checksum-mismatch|checksum mismatch/,
  );
  assert.equal(
    readFileSync(destination, 'utf8'),
    pluginFixtureContent,
    'Checksum mismatch replaced the existing destination',
  );
}

async function exerciseJava(driver, fixture) {
  await openServerView(driver, 'general-settings');
  await click(driver, '[data-testid="server-settings-java-manage-button"]');
  await visibleElement(driver, '[data-testid="java-manager-dialog"]');
  await click(driver, '[data-testid="java-download-21"]');
  await visibleElement(driver, '[data-testid="java-installed-21"]', 60_000);

  const javaInstallRoot = path.join(fixture.appDataDir, 'java', 'jdk-21');
  assert.ok(existsSync(javaInstallRoot), 'Java fixture was not installed below managed storage');
  assert.ok(readdirSync(javaInstallRoot).length > 0, 'Java fixture install directory is empty');
  await click(driver, '.java-manager-modal__close-button');
}

async function exerciseNgrok(driver, fixture) {
  await openServerView(driver, 'general-settings');
  const token = 'real-e2e-ngrok-token-not-a-secret';
  await click(driver, '[data-testid="ngrok-toggle"]');
  await visibleElement(driver, '[data-testid="ngrok-token-input"]');
  await setReactInputValue(driver, '[data-testid="ngrok-token-input"]', token);
  await click(driver, '[data-testid="ngrok-token-save"]');
  await waitFor(
    async () =>
      (await driver.executeScript('return document.body?.innerText ?? "";')).includes(
        '127.0.0.1:25565',
      ),
    'Fake ngrok process did not report its tunnel URL through IPC',
  );
  const bodyText = await driver.executeScript('return document.body?.innerText ?? "";');
  assert.equal(bodyText.includes(token), false, 'ngrok token leaked to renderer DOM');
  const configPath = path.join(fixture.appDataDir, 'config.json');
  if (existsSync(configPath)) {
    assert.equal(
      readFileSync(configPath, 'utf8').includes(token),
      false,
      'ngrok token leaked to config',
    );
  }
  await click(driver, '[data-testid="ngrok-toggle"]');
  await waitFor(
    () =>
      driver.executeScript(
        'return document.querySelector("[data-testid=ngrok-toggle]")?.checked === false;',
      ),
    'Fake ngrok process did not stop through IPC',
  );
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
  await waitFor(
    () => existsSync(archivePath),
    `Backup archive was not created: ${archivePath}`,
    60_000,
  );
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
  const args = isWindows ? ['-xOf', archivePath, entryName] : ['-p', archivePath, entryName];
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) {
    throw new Error(
      `Could not read ${entryName} from ${archivePath}: ${result.stderr ?? result.error}`,
    );
  }
  return result.stdout;
}

async function main() {
  const testRoot = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'mc-vector-tauri-e2e-'));
  const artifactDirectory = path.join(projectRoot, 'test-results', 'tauri-e2e');
  let succeeded = false;
  let normalDriver;
  let normalWebDriver;
  let failureDriver;
  let failureWebDriver;
  let artifactFixture;
  try {
    const identifier = 'com.tukuyomi032.mcvector.e2e';
    const environment = createTestEnvironment(testRoot);
    const configPath = path.join(testRoot, 'tauri.e2e.conf.json');
    writeFileSync(
      configPath,
      JSON.stringify({ identifier, productName: 'MC-Vector E2E' }, null, 2),
    );
    const fixture = await createFixture(environment, identifier, testRoot);
    logStep(`fixture ready (${identifier})`);
    artifactFixture = await startArtifactFixture(await createJavaFixtureArchive(testRoot));
    Object.assign(environment, {
      MC_VECTOR_E2E_JAVA_ARCHIVE_URL: artifactFixture.javaUrl,
      MC_VECTOR_E2E_JAVA_SHA256: artifactFixture.javaChecksum,
      MC_VECTOR_E2E_JAVA_SIZE: String(artifactFixture.javaSize),
      VITE_MC_VECTOR_E2E_PLUGIN_URL: artifactFixture.url,
      VITE_MC_VECTOR_E2E_PLUGIN_SHA256: artifactFixture.checksum,
    });
    const binary = await buildDebugBinary(identifier, configPath, environment);
    logStep(`debug binary ready (${binary})`);

    normalDriver = await startWebDriver(environment, await reservePort());
    logStep('WebDriver ready');
    normalWebDriver = await createWebDriver(normalDriver.url, binary);
    await exerciseLifecycle(normalWebDriver, fixture);
    logStep('EULA, lifecycle, console command, and process state passed');
    await exerciseFilesAndSettings(normalWebDriver, fixture);
    logStep('managed files, E2E-only import, and settings persistence passed');
    await exerciseNgrok(normalWebDriver, fixture);
    logStep('fake ngrok process, token UI, and secret non-leakage passed');
    await exerciseJava(normalWebDriver, fixture);
    logStep('Java fixture verification, extraction, and managed install passed');
    await exerciseVerifiedArtifact(normalWebDriver, fixture, artifactFixture);
    logStep('verified artifact checksum and atomic destination preservation passed');
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
      async () =>
        (await visibleElement(normalWebDriver, `[data-testid="server-stop-button"]`)).isEnabled(),
      'Fixture server did not enter the running state',
      30_000,
    );
    logStep('running-server guard passed');
    await restoreThroughUi(normalWebDriver, { path: propertiesPath, value: originalProperties });
    await waitForToast(normalWebDriver, 'Failed to restore backup');
    assert.equal(readFileSync(propertiesPath, 'utf8'), originalProperties);
    await click(normalWebDriver, '[data-testid="server-stop-button"]');
    await waitFor(
      async () =>
        (await visibleElement(normalWebDriver, '[data-testid="server-start-button"]')).isEnabled(),
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
    writeFileSync(
      path.join(fixture.serverPath, 'stale-before-injected-failure.txt'),
      'must remain',
    );
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
    const failureRow = await visibleElement(
      failureWebDriver,
      `[data-testid="backup-row-${backupName}"]`,
    );
    await failureRow.findElement(By.css('button')).click();
    await waitForToast(failureWebDriver, 'Failed to restore backup');
    assert.equal(readFileSync(propertiesPath, 'utf8'), 'failure-mutated-properties');
    assert.equal(
      existsSync(path.join(fixture.serverPath, 'stale-before-injected-failure.txt')),
      true,
    );
    const leftovers = readdirSync(path.dirname(fixture.serverPath));
    assert.equal(
      leftovers.some(
        (entry) =>
          entry.startsWith('.mc-vector-restore-staging-') ||
          entry.startsWith('.mc-vector-restore-rollback-'),
      ),
      false,
    );
    logStep('injected restore failure rollback passed');

    console.log(`Real Tauri smoke E2E passed on ${platform}`);
    succeeded = true;
  } finally {
    await failureWebDriver?.quit().catch(() => undefined);
    await normalWebDriver?.quit().catch(() => undefined);
    await stopProcess(failureDriver?.child);
    await stopProcess(normalDriver?.child);
    await artifactFixture?.close().catch((error) => {
      console.error(`Failed to close real Tauri E2E artifact fixture: ${describeError(error)}`);
    });
    if (!succeeded) {
      console.error(`Real Tauri E2E failed; retained diagnostics at ${testRoot}`);
      if (artifactDirectory) {
        const destination = path.join(artifactDirectory, path.basename(testRoot));
        mkdirSync(artifactDirectory, { recursive: true });
        cpSync(testRoot, destination, { recursive: true });
        for (const [name, driver] of [
          ['normal-driver.log', normalDriver],
          ['failure-driver.log', failureDriver],
        ]) {
          if (driver?.output) {
            writeFileSync(path.join(artifactDirectory, name), driver.output.join(''));
          }
        }
        console.error(`CI diagnostics copied to ${artifactDirectory}`);
      }
    } else {
      try {
        rmSync(testRoot, { recursive: true, force: true });
      } catch (error) {
        console.error(`Real Tauri E2E cleanup failed for ${testRoot}: ${describeError(error)}`);
        process.exitCode = 1;
      }
    }
  }
}

main().catch((error) => {
  console.error(
    `[real-tauri-e2e] failed (error ${errorFingerprint(error)}); inspect retained diagnostics for details`,
  );
  process.exitCode = 1;
});
