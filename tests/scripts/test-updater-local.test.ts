import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// @ts-ignore The local updater harness is JavaScript and is exercised directly by Vitest.
import * as localUpdaterHarness from '../../scripts/test-updater-local.mjs';

const {
  assertLoopbackHttpUrl,
  createTauriBuildArgs,
  createTargetManifest,
  createUpdaterBuildEnvironment,
  createTauriOverlay,
  createQaInfoPlist,
  isQaBundleArtifactName,
  parseModeInput,
  promptLine,
  removeQaBundleArtifacts,
  runtimeDirectoryFor,
  cleanupRuntimeDirectory,
  findQaAppProcesses,
  tamperSignature,
  TEST_RELEASES,
  waitForAvailableVersion,
  reconnectDriver,
} = localUpdaterHarness;

describe('local updater harness configuration', () => {
  it('uses the fixed low-version Stable and Beta test pairs', () => {
    expect(TEST_RELEASES.stable).toMatchObject({
      initialVersion: '0.0.1',
      candidateVersion: '0.0.2',
      target: 'stable-darwin-aarch64',
    });
    expect(TEST_RELEASES.beta).toMatchObject({
      initialVersion: '0.0.2-beta.1',
      candidateVersion: '0.0.2-beta.2',
      invalidVersion: '0.0.3-beta.1',
      target: 'beta-darwin-aarch64',
    });
  });

  it('accepts both interactive run modes and rejects unknown input', () => {
    expect(parseModeInput('1')).toBe('manual');
    expect(parseModeInput('M')).toBe('manual');
    expect(parseModeInput('2')).toBe('auto');
    expect(parseModeInput(' Auto ')).toBe('auto');
    expect(parseModeInput('release')).toBeNull();
  });

  it('does not accept a prompt that resolves after an interrupt', async () => {
    let resolveAnswer!: (answer: string) => void;
    let checks = 0;
    const question = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveAnswer = resolve;
        }),
    );
    const prompt = promptLine({ question }, 'final manual prompt', () => {
      checks += 1;
      if (checks === 2) throw new Error('SIGINT received; updater harness is aborting');
    });

    resolveAnswer('');

    await expect(prompt).rejects.toThrow(/SIGINT received/);
    expect(question).toHaveBeenCalledTimes(1);
    expect(checks).toBe(2);
  });

  it('changes the Base64-wrapped Minisign payload without changing comments or key metadata', () => {
    const minisignText =
      [
        'untrusted comment: signature from minisign secret key',
        'RWQf6LRCGA9i59SLOFxz6NxvASXDJeRtuZykwQepbDEGt87ig1BNpWaVWuNrm73YiIiJbq71Wi+dP9eKL8OC351vwIasSSbXxwA=',
        'trusted comment: timestamp:1555779966\tfile:test',
        'QtKMXWyYcwdpZAlPF7tE2ENJkRd1ujvKjlj1m9RtHTBnZPa5WKU5uWRs5GoP5M/VqE81QFuMKI5k/SfNQUaOAA==',
      ].join('\n') + '\n';
    const signature = Buffer.from(minisignText, 'utf8').toString('base64');

    const mutated = tamperSignature(signature);
    const originalLines = Buffer.from(signature, 'base64').toString('utf8').split('\n');
    const mutatedLines = Buffer.from(mutated, 'base64').toString('utf8').split('\n');
    const originalPayload = Buffer.from(originalLines[1], 'base64');
    const mutatedPayload = Buffer.from(mutatedLines[1], 'base64');

    expect(mutatedLines[0]).toBe(originalLines[0]);
    expect(mutatedLines[2]).toBe(originalLines[2]);
    expect(mutatedLines[3]).toBe(originalLines[3]);
    expect(mutatedLines[1]).not.toBe(originalLines[1]);
    expect(mutatedPayload.subarray(0, 10)).toEqual(originalPayload.subarray(0, 10));
    expect(mutatedPayload.subarray(10)).not.toEqual(originalPayload.subarray(10));
    expect(() => tamperSignature('not a signature')).toThrow(/Base64 encoded/);
  });

  it('reads the offered version through WebDriver executeScript', async () => {
    const driver = { executeScript: vi.fn().mockResolvedValue(true) };

    await waitForAvailableVersion(driver, '0.0.3-beta.1');

    expect(driver.executeScript).toHaveBeenCalledWith(
      expect.stringContaining('document.querySelector'),
      '0.0.3-beta.1',
    );
  });

  it('matches QA processes only when their command starts with the exact runtime executable path', () => {
    const executable =
      '/repo/test-results/updater-local/run/runtime/apps/stable/MC-Vector Updater QA Stable.app/Contents/MacOS/MC-Vector Updater QA Stable';
    const processList = [
      `501 ${executable}`,
      `502 ${executable} --test-mode`,
      `503 ${executable}-helper`,
      `504 /Applications/MC-Vector.app/Contents/MacOS/MC-Vector`,
      `505 /bin/zsh -c open ${executable}`,
      `506 ${executable}`,
    ].join('\n');

    expect(findQaAppProcesses(processList, [executable], 506)).toEqual([
      { pid: 501, command: executable },
      { pid: 502, command: `${executable} --test-mode` },
    ]);
  });

  it('stops the restarted QA app before creating a fresh WebDriver session', async () => {
    const events: string[] = [];
    const appPath = '/runtime/apps/stable/MC-Vector Updater QA Stable.app';
    const freshSession = { name: 'fresh-session' };
    const existingDriver = {
      executeScript: vi.fn(async () => {
        events.push('probe');
        throw new Error('WebDriver session was lost');
      }),
      quit: vi.fn(async () => {
        events.push('quit');
      }),
    };
    const stopApp = vi.fn(async (targetAppPath: string) => {
      events.push(`stop:${targetAppPath}`);
    });
    const createSession = vi.fn(async () => {
      events.push('create-session');
      return freshSession;
    });
    const pause = vi.fn(async () => {
      events.push('pause');
    });

    const result = await reconnectDriver(
      existingDriver,
      'http://127.0.0.1:43210',
      appPath,
      undefined,
      { stopApp, createSession, pause },
    );

    expect(result).toBe(freshSession);
    expect(events).toEqual(['probe', 'quit', `stop:${appPath}`, 'pause', 'create-session']);
  });

  it('keeps the QA app identity and HTTP exception inside the temporary overlay', () => {
    const overlay = createTauriOverlay({
      release: TEST_RELEASES.beta,
      version: TEST_RELEASES.beta.initialVersion,
      pubkey: 'disposable-public-key',
      port: 43210,
    });

    expect(overlay.version).toBe('0.0.2-beta.1');
    expect(overlay.identifier).toBe('com.tukuyomi032.mcvector.updaterqa.beta');
    expect(overlay.productName).toBe('MC-Vector Updater QA Beta');
    expect(overlay.bundle.targets).toEqual(['app']);
    expect(overlay.bundle.macOS.infoPlist).toBe('beta-0-0-2-beta-1.Info.plist');
    expect(overlay.plugins.updater).toMatchObject({
      active: true,
      pubkey: 'disposable-public-key',
      endpoints: ['http://127.0.0.1:43210/updates/{{target}}.json'],
      dangerousInsecureTransportProtocol: true,
    });
    expect(createQaInfoPlist('0.0.2-beta.1')).toContain(
      '<key>MCVectorUpdaterQAVersion</key>\n  <string>0.0.2-beta.1</string>',
    );
    expect(() => createQaInfoPlist('0.0.2 invalid')).toThrow(/Invalid local test version/);
  });

  it('signs updater artifacts without disabling app signing and strips product Apple credentials', () => {
    const args = createTauriBuildArgs('/tmp/updater-qa.conf.json');
    expect(args).toContain('--features');
    expect(args).toContain('updater-e2e');
    expect(args).not.toContain('--no-sign');

    const environment = createUpdaterBuildEnvironment(
      {
        PATH: ['/custom/bin', '/opt/homebrew/bin', '/native/bun/bin'].join(path.delimiter),
        HOME: '/native/home',
        CARGO_HOME: '/native/cargo',
        APPLE_SIGNING_IDENTITY: 'Developer ID Application: production',
        APPLE_CERTIFICATE: 'production-certificate',
        APPLE_CERTIFICATE_PASSWORD: 'production-password',
        APPLE_ID: 'release@example.com',
        APPLE_PASSWORD: 'production-app-password',
        APPLE_TEAM_ID: 'PRODUCTIONTEAM',
        TAURI_SIGNING_PRIVATE_KEY: 'production-key',
        TAURI_SIGNING_PRIVATE_KEY_PATH: '/production/key',
        TAURI_SIGNING_PRIVATE_KEY_PASSWORD: 'production-password',
      },
      '/tmp/updater-qa.key',
    );

    expect(environment).toMatchObject({
      TAURI_SIGNING_PRIVATE_KEY: '/tmp/updater-qa.key',
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: '',
      APPLE_SIGNING_IDENTITY: '-',
      PATH: ['/usr/bin', '/custom/bin', '/opt/homebrew/bin', '/native/bun/bin'].join(
        path.delimiter,
      ),
      HOME: '/native/home',
      CARGO_HOME: '/native/cargo',
    });
    expect(environment).not.toHaveProperty('APPLE_CERTIFICATE');
    expect(environment).not.toHaveProperty('APPLE_CERTIFICATE_PASSWORD');
    expect(environment).not.toHaveProperty('APPLE_ID');
    expect(environment).not.toHaveProperty('APPLE_PASSWORD');
    expect(environment).not.toHaveProperty('APPLE_TEAM_ID');
    expect(environment).not.toHaveProperty('TAURI_SIGNING_PRIVATE_KEY_PATH');
    expect(Object.keys(environment).filter((name) => name.startsWith('APPLE_'))).toEqual([
      'APPLE_SIGNING_IDENTITY',
    ]);
  });

  it('recognizes exact QA app and updater output names for cleanup', () => {
    expect(isQaBundleArtifactName('MC-Vector Updater QA Stable.app')).toBe(true);
    expect(isQaBundleArtifactName('MC-Vector Updater QA Stable.app.tar.gz')).toBe(true);
    expect(isQaBundleArtifactName('MC-Vector Updater QA Stable.app.tar.gz.sig')).toBe(true);
    expect(
      isQaBundleArtifactName('MC-Vector Updater QA Beta_0.0.2-beta.2_aarch64.app.tar.gz'),
    ).toBe(true);
    expect(
      isQaBundleArtifactName('MC-Vector Updater QA Beta_0.0.2-beta.2_aarch64.app.tar.gz.sig'),
    ).toBe(true);
    expect(isQaBundleArtifactName('MC-Vector_2.0.64_darwin-aarch64.app.tar.gz')).toBe(false);
    expect(isQaBundleArtifactName('MC-Vector Debug.app')).toBe(false);
    expect(
      isQaBundleArtifactName('MC-Vector Updater QA Beta_0.0.2-beta.20_aarch64.app.tar.gz'),
    ).toBe(false);
  });

  it('removes only QA outputs and preserves existing product and debug bundles', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'mc-vector-updater-cleanup-'));
    const qaApp = path.join(directory, 'MC-Vector Updater QA Stable.app');
    const qaArchive = 'MC-Vector Updater QA Stable.app.tar.gz';
    const qaSignature = `${qaArchive}.sig`;
    const productArchive = 'MC-Vector_2.0.64_darwin-aarch64.app.tar.gz';
    const debugApp = path.join(directory, 'MC-Vector Debug.app');
    mkdirSync(path.join(qaApp, 'Contents'), { recursive: true });
    mkdirSync(debugApp);
    writeFileSync(path.join(directory, qaArchive), 'qa archive');
    writeFileSync(path.join(directory, qaSignature), 'qa signature');
    writeFileSync(path.join(directory, productArchive), 'product archive');

    try {
      expect(removeQaBundleArtifacts(directory).sort()).toEqual(
        [path.basename(qaApp), qaArchive, qaSignature].sort(),
      );
      expect(existsSync(qaApp)).toBe(false);
      expect(existsSync(path.join(directory, qaArchive))).toBe(false);
      expect(existsSync(path.join(directory, qaSignature))).toBe(false);
      expect(existsSync(path.join(directory, productArchive))).toBe(true);
      expect(existsSync(debugApp)).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('places disposable runtime below each ignored run directory and preserves run diagnostics on cleanup', () => {
    const updaterResultsRoot = path.join(process.cwd(), 'test-results', 'updater-local');
    mkdirSync(updaterResultsRoot, { recursive: true });
    const runDirectory = mkdtempSync(path.join(updaterResultsRoot, 'runtime-policy-'));
    const runtimeDirectory = runtimeDirectoryFor(runDirectory);
    mkdirSync(runtimeDirectory);
    writeFileSync(path.join(runtimeDirectory, 'updater-test.key'), 'disposable key');
    writeFileSync(path.join(runDirectory, 'run.log'), 'diagnostics');
    writeFileSync(path.join(runDirectory, 'stable-before-update.png'), 'screenshot');

    try {
      expect(runtimeDirectory).toBe(path.join(runDirectory, 'runtime'));
      expect(() => runtimeDirectoryFor(path.dirname(updaterResultsRoot))).toThrow(
        /test-results\/updater-local/,
      );
      expect(cleanupRuntimeDirectory(runDirectory)).toBe(runtimeDirectory);
      expect(existsSync(runtimeDirectory)).toBe(false);
      expect(existsSync(path.join(runDirectory, 'run.log'))).toBe(true);
      expect(existsSync(path.join(runDirectory, 'stable-before-update.png'))).toBe(true);
    } finally {
      rmSync(runDirectory, { recursive: true, force: true });
    }
  });

  it('treats a readline AbortError as SIGINT so cleanup can finish', async () => {
    const readline = {
      question: vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error('readline interrupted'), { name: 'AbortError' }),
        ),
      close: vi.fn(),
    };

    await expect(promptLine(readline, 'inspection prompt')).rejects.toThrow(/SIGINT received/);
    expect(readline.close).toHaveBeenCalledTimes(1);
  });

  it('builds only loopback artifact manifests with the expected SemVer', () => {
    const manifest = createTargetManifest({
      version: '0.0.2-beta.2',
      signature: 'disposable-signature',
      assetPath: '/assets/beta-0.0.2-beta.2.app.tar.gz',
      baseUrl: 'http://127.0.0.1:43210/',
    });

    expect(manifest).toMatchObject({
      version: '0.0.2-beta.2',
      url: 'http://127.0.0.1:43210/assets/beta-0.0.2-beta.2.app.tar.gz',
      signature: 'disposable-signature',
    });
    expect(() =>
      createTargetManifest({
        version: '0.0.2',
        signature: 'signature',
        assetPath: '/assets/file.tar.gz',
        baseUrl: 'https://example.com/',
      }),
    ).toThrow(/loopback/);
    expect(() => assertLoopbackHttpUrl('http://192.168.0.5:43210/updates/stable.json')).toThrow(
      /loopback/,
    );
  });
});
