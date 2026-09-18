import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, '..');
const defaultPluginJar = join(projectDirectory, 'build', 'libs', 'mc-vector-core.jar');
const pluginJar = resolve(process.env.MC_VECTOR_CORE_JAR ?? defaultPluginJar);
const paperJar = process.env.PAPER_JAR ? resolve(process.env.PAPER_JAR) : null;
const javaBinary = process.env.JAVA_BIN ?? 'java';
const smokeLogDirectory = process.env.SMOKE_LOG_DIR ? resolve(process.env.SMOKE_LOG_DIR) : null;
const bridgeToken = 'paper-smoke-token-123456';
const serverId = 'paper-smoke';
const protocolVersion = 2;
const testTimeoutMs = Number.parseInt(process.env.SMOKE_TIMEOUT_MS ?? '120000', 10);

if (!paperJar) {
  throw new Error(
    'PAPER_JAR is required. Download a pinned Paper 1.21.10 jar from the official distribution and pass its path.',
  );
}

async function delay(milliseconds) {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function waitFor(predicate, label, timeoutMs = testTimeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function withTimeout(promise, label, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function getUnusedPort() {
  const server = createServer();
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : null;
  await new Promise((resolvePromise) => server.close(resolvePromise));
  if (!port) {
    throw new Error('Could not allocate a loopback port');
  }
  return port;
}

function createFixture() {
  const messages = [];
  const connectionErrors = [];
  let server;
  let helloResolve;
  let snapshotResolve;
  let heartbeatResolve;
  let chunkSnapshotResolve;
  let unavailableResolve;
  let connectedSocket;
  const helloPromise = new Promise((resolvePromise) => {
    helloResolve = resolvePromise;
  });
  const snapshotPromise = new Promise((resolvePromise) => {
    snapshotResolve = resolvePromise;
  });
  const heartbeatPromise = new Promise((resolvePromise) => {
    heartbeatResolve = resolvePromise;
  });
  const chunkSnapshotPromise = new Promise((resolvePromise) => {
    chunkSnapshotResolve = resolvePromise;
  });
  const unavailablePromise = new Promise((resolvePromise) => {
    unavailableResolve = resolvePromise;
  });

  const fixture = {
    messages,
    connectionErrors,
    helloPromise,
    snapshotPromise,
    heartbeatPromise,
    chunkSnapshotPromise,
    unavailablePromise,
    async listen() {
      server = createServer((socket) => {
        connectedSocket = socket;
        let buffer = '';
        socket.setEncoding('utf8');
        socket.on('data', (chunk) => {
          buffer += chunk;
          let newlineIndex = buffer.indexOf('\n');
          while (newlineIndex >= 0) {
            const rawLine = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);
            newlineIndex = buffer.indexOf('\n');
            if (!rawLine) {
              continue;
            }
            let message;
            try {
              message = JSON.parse(rawLine);
            } catch (error) {
              connectionErrors.push(`invalid fixture JSON: ${error.message}`);
              continue;
            }
            messages.push(message);
            if (message.type === 'hello') {
              helloResolve(message);
              socket.write(
                `{"type":"hello_ack","accepted":true,"protocolVersion":${protocolVersion}}\n`,
              );
            }
            if (message.type === 'player_snapshot') {
              snapshotResolve(message);
            }
            if (message.type === 'heartbeat') {
              heartbeatResolve(message);
            }
            if (message.type === 'chunk_snapshot') {
              chunkSnapshotResolve(message);
            }
            if (message.type === 'chunk_snapshot_unavailable') {
              unavailableResolve(message);
            }
          }
        });
        socket.on('error', (error) => {
          connectionErrors.push(error.message);
        });
        socket.on('close', () => {
          if (connectedSocket === socket) {
            connectedSocket = undefined;
          }
        });
      });
      await new Promise((resolvePromise, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolvePromise);
      });
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Fixture listener did not expose a TCP port');
      }
      return address.port;
    },
    requestSnapshots() {
      if (!connectedSocket) {
        throw new Error('Paper bridge socket is not connected');
      }
      connectedSocket.write(
        '{"type":"chunk_snapshot_request","requestId":"loaded-0-0",' +
          '"dimension":"minecraft:overworld","chunkX":0,"chunkZ":0,"preferLive":true}\n',
      );
      connectedSocket.write(
        '{"type":"chunk_snapshot_request","requestId":"unloaded-100000",' +
          '"dimension":"minecraft:overworld","chunkX":100000,"chunkZ":100000,"preferLive":true}\n',
      );
    },
    async close() {
      if (!server) {
        return;
      }
      await new Promise((resolvePromise) => server.close(resolvePromise));
      server = undefined;
    },
  };
  return fixture;
}

async function writeServerFiles(
  serverDirectory,
  bridgePort,
  { disabled = false, serverPort } = {},
) {
  await mkdir(join(serverDirectory, 'plugins'), { recursive: true });
  await writeFile(join(serverDirectory, 'eula.txt'), '# smoke test only\neula=true\n');
  await writeFile(
    join(serverDirectory, 'server.properties'),
    [
      'online-mode=false',
      'spawn-protection=0',
      'view-distance=2',
      'simulation-distance=2',
      `server-port=${serverPort}`,
      '',
    ].join('\n'),
  );
  await writeFile(
    join(serverDirectory, 'plugins', 'mc-vector-core.yml'),
    [
      'managed-by: MC-Vector',
      'schema-version: 1',
      `server-id: ${serverId}`,
      'host: 127.0.0.1',
      `port: ${bridgePort}`,
      `token: ${bridgeToken}`,
      `protocol-version: ${protocolVersion}`,
      'plugin-version: 0.1.0',
      '',
    ].join('\n'),
  );
  await copyFile(
    pluginJar,
    join(
      serverDirectory,
      'plugins',
      disabled ? 'mc-vector-core.jar.disabled' : 'mc-vector-core.jar',
    ),
  );
}

function startPaper(serverDirectory) {
  const logChunks = [];
  const logPath = join(serverDirectory, 'logs', 'latest.log');
  const child = spawn(javaBinary, ['-Xms512M', '-Xmx1G', '-jar', paperJar, '--nogui'], {
    cwd: serverDirectory,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PAPER_TERMINAL_WIDTH: '120' },
  });
  const append = (chunk) => logChunks.push(chunk.toString());
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  const exitPromise = new Promise((resolvePromise) => {
    child.once('close', (code, signal) => resolvePromise({ code, signal }));
  });
  return {
    child,
    async readLog() {
      let fileLog = '';
      try {
        fileLog = await readFile(logPath, 'utf8');
      } catch {
        // Paper creates latest.log after the process starts.
      }
      return `${logChunks.join('')}\n${fileLog}`;
    },
    exitPromise,
  };
}

async function stopPaper(processHandle) {
  if (processHandle.child.exitCode !== null) {
    return processHandle.exitPromise;
  }
  processHandle.child.stdin.write('stop\n');
  const result = await Promise.race([processHandle.exitPromise, delay(20_000).then(() => null)]);
  if (result) {
    return result;
  }
  processHandle.child.kill('SIGTERM');
  const forcedResult = await Promise.race([
    processHandle.exitPromise,
    delay(5_000).then(() => null),
  ]);
  if (!forcedResult) {
    processHandle.child.kill('SIGKILL');
    throw new Error('Paper did not exit after stop and SIGTERM');
  }
  return forcedResult;
}

async function persistLog(name, log, extra = '') {
  if (!smokeLogDirectory) {
    return;
  }
  await mkdir(smokeLogDirectory, { recursive: true });
  await writeFile(join(smokeLogDirectory, `${name}.log`), `${log}${extra}`);
}

async function runConnected() {
  const serverDirectory = await mkdtemp(join(tmpdir(), 'mc-vector-paper-connected-'));
  const fixture = createFixture();
  let processHandle;
  let log = '';
  try {
    const port = await fixture.listen();
    const serverPort = await getUnusedPort();
    await writeServerFiles(serverDirectory, port, { serverPort });
    processHandle = startPaper(serverDirectory);
    await waitFor(async () => /Done \(/.test(await processHandle.readLog()), 'Paper startup');
    const hello = await withTimeout(fixture.helloPromise, 'bridge hello', testTimeoutMs);
    if (
      hello.serverId !== serverId ||
      hello.protocolVersion !== protocolVersion ||
      hello.minecraftVersion !== '1.21.10' ||
      hello.token !== bridgeToken ||
      !Array.isArray(hello.capabilities) ||
      !hello.capabilities.includes('player_snapshot') ||
      !hello.capabilities.includes('chunk_dirty') ||
      !hello.capabilities.includes('chunk_surface_snapshot_v1')
    ) {
      throw new Error(`Unexpected bridge hello: ${JSON.stringify(hello)}`);
    }
    processHandle.child.stdin.write('forceload add 0 0\n');
    await delay(1_000);
    fixture.requestSnapshots();
    const [playerSnapshot, heartbeat] = await Promise.all([
      withTimeout(fixture.snapshotPromise, 'player snapshot', 15_000),
      withTimeout(fixture.heartbeatPromise, 'heartbeat', 15_000),
    ]);
    if (
      playerSnapshot.type !== 'player_snapshot' ||
      !Array.isArray(playerSnapshot.players) ||
      !Number.isFinite(playerSnapshot.capturedAt)
    ) {
      throw new Error(`Unexpected player snapshot: ${JSON.stringify(playerSnapshot)}`);
    }
    if (heartbeat.type !== 'heartbeat' || !Number.isFinite(heartbeat.capturedAt)) {
      throw new Error(`Unexpected heartbeat: ${JSON.stringify(heartbeat)}`);
    }
    const chunkSnapshot = await withTimeout(
      fixture.chunkSnapshotPromise,
      'chunk snapshot response',
      5_000,
    );
    const unavailable = await withTimeout(
      fixture.unavailablePromise,
      'unloaded chunk response',
      5_000,
    );
    if (
      chunkSnapshot.requestId !== 'loaded-0-0' ||
      chunkSnapshot.codec !== 'deflate-base64' ||
      typeof chunkSnapshot.payload !== 'string' ||
      chunkSnapshot.payload.length === 0
    ) {
      throw new Error(`Unexpected chunk snapshot: ${JSON.stringify(chunkSnapshot)}`);
    }
    if (unavailable.requestId !== 'unloaded-100000' || unavailable.reason !== 'not_loaded') {
      throw new Error(`Unexpected unavailable snapshot: ${JSON.stringify(unavailable)}`);
    }
    log = await processHandle.readLog();
    await stopPaper(processHandle);
    if (processHandle.child.exitCode !== 0) {
      throw new Error(`Paper exited with code ${processHandle.child.exitCode}`);
    }
    await persistLog('connected', log, `\nfixture=${JSON.stringify(fixture.messages)}\n`);
    console.log(
      'connected: Paper loaded MC-Vector Core and exchanged hello/telemetry/chunk snapshot messages',
    );
  } catch (error) {
    log = processHandle ? await processHandle.readLog() : log;
    await persistLog('connected-failure', log, `\nfixture=${JSON.stringify(fixture.messages)}\n`);
    throw error;
  } finally {
    if (processHandle?.child.exitCode === null) {
      await stopPaper(processHandle).catch(() => processHandle.child.kill('SIGKILL'));
    }
    await fixture.close();
    await rm(serverDirectory, { recursive: true, force: true });
  }
}

async function runOffline() {
  const serverDirectory = await mkdtemp(join(tmpdir(), 'mc-vector-paper-offline-'));
  let processHandle;
  let log = '';
  try {
    const port = await getUnusedPort();
    const serverPort = await getUnusedPort();
    await writeServerFiles(serverDirectory, port, { serverPort });
    processHandle = startPaper(serverDirectory);
    await waitFor(
      async () => /Done \(/.test(await processHandle.readLog()),
      'Paper startup without bridge listener',
    );
    await delay(1_500);
    log = await processHandle.readLog();
    await stopPaper(processHandle);
    if (processHandle.child.exitCode !== 0) {
      throw new Error(`Paper exited with code ${processHandle.child.exitCode} without listener`);
    }
    await persistLog('offline', log);
    console.log('offline: Paper stayed running without a bridge listener');
  } catch (error) {
    log = processHandle ? await processHandle.readLog() : log;
    await persistLog('offline-failure', log);
    throw error;
  } finally {
    if (processHandle?.child.exitCode === null) {
      await stopPaper(processHandle).catch(() => processHandle.child.kill('SIGKILL'));
    }
    await rm(serverDirectory, { recursive: true, force: true });
  }
}

async function runDisabled() {
  const serverDirectory = await mkdtemp(join(tmpdir(), 'mc-vector-paper-disabled-'));
  const fixture = createFixture();
  let processHandle;
  let log = '';
  try {
    const port = await fixture.listen();
    const serverPort = await getUnusedPort();
    await writeServerFiles(serverDirectory, port, { disabled: true, serverPort });
    processHandle = startPaper(serverDirectory);
    await waitFor(
      async () => /Done \(/.test(await processHandle.readLog()),
      'Paper startup with disabled plugin',
    );
    await delay(2_000);
    log = await processHandle.readLog();
    await stopPaper(processHandle);
    if (fixture.messages.some((message) => message.type === 'hello')) {
      throw new Error('A .jar.disabled plugin unexpectedly sent a bridge hello');
    }
    if (/Enabling MC-Vector-Core/.test(log)) {
      throw new Error('Paper enabled MC-Vector Core from a .jar.disabled file');
    }
    if (processHandle.child.exitCode !== 0) {
      throw new Error(`Paper exited with code ${processHandle.child.exitCode} for disabled plugin`);
    }
    await persistLog('disabled', log, `\nfixture=${JSON.stringify(fixture.messages)}\n`);
    console.log('disabled: Paper ignored mc-vector-core.jar.disabled');
  } catch (error) {
    log = processHandle ? await processHandle.readLog() : log;
    await persistLog('disabled-failure', log, `\nfixture=${JSON.stringify(fixture.messages)}\n`);
    throw error;
  } finally {
    if (processHandle?.child.exitCode === null) {
      await stopPaper(processHandle).catch(() => processHandle.child.kill('SIGKILL'));
    }
    await fixture.close();
    await rm(serverDirectory, { recursive: true, force: true });
  }
}

async function main() {
  await readFile(pluginJar);
  await readFile(paperJar);
  await runConnected();
  await runOffline();
  await runDisabled();
}

main().catch((error) => {
  console.error(`Paper bridge smoke failed: ${error.stack ?? error.message}`);
  process.exitCode = 1;
});
