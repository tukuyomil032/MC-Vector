import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
// @ts-ignore The release helper is JavaScript and is exercised directly by Vitest.
import { createTargetManifest, feedTargetsForRelease } from '../../scripts/release-manifest.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const manifestScript = join(repositoryRoot, 'scripts/release-manifest.mjs');

function createReleaseFixture(version: string) {
  const root = mkdtempSync(join(tmpdir(), 'mc-vector-manifest-'));
  const assets = join(root, 'release-assets');
  const output = join(root, 'gh-pages-deploy');
  const notes = join(root, 'notes.md');
  mkdirSync(assets);
  mkdirSync(output);
  writeFileSync(notes, 'release notes\n');
  writeFileSync(
    join(output, 'latest.json'),
    `${JSON.stringify(createLegacyLatestManifest(), null, 2)}\n`,
  );
  for (const asset of [
    `MC-Vector_${version}_darwin-aarch64.app.tar.gz`,
    `MC-Vector_${version}_darwin-x86_64.app.tar.gz`,
    `MC-Vector_${version}_windows-x86_64-setup.exe`,
  ]) {
    writeFileSync(join(assets, asset), 'artifact');
    writeFileSync(join(assets, `${asset}.sig`), 'c2ln');
  }
  return { assets, notes, output, root };
}

const platforms = ['darwin-aarch64', 'darwin-x86_64', 'windows-x86_64'] as const;
const assetSuffixes = {
  'darwin-aarch64': 'darwin-aarch64.app.tar.gz',
  'darwin-x86_64': 'darwin-x86_64.app.tar.gz',
  'windows-x86_64': 'windows-x86_64-setup.exe',
} as const;

function createLegacyLatestManifest() {
  return {
    version: '2.0.63',
    notes: 'Previous stable release.\n',
    pub_date: '2026-09-18T14:30:00Z',
    platforms: Object.fromEntries(
      platforms.map((platform) => [
        platform,
        {
          url: `https://example.invalid/v2.0.63/${platform}.asset`,
          signature: 'c2ln',
        },
      ]),
    ),
  };
}

function writeLegacyLatest(fixture: ReturnType<typeof createReleaseFixture>, manifest: unknown) {
  mkdirSync(fixture.output, { recursive: true });
  const latestPath = join(fixture.output, 'latest.json');
  const content =
    typeof manifest === 'string' ? manifest : `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(latestPath, content);
  return { content, latestPath };
}

function runApplyFixture(fixture: ReturnType<typeof createReleaseFixture>, version: string) {
  return spawnSync(
    process.execPath,
    [manifestScript, 'apply', version, '2026-10-26T00:00:00Z', 'https://example.invalid/release'],
    { cwd: fixture.root, encoding: 'utf8', input: readFileSync(fixture.notes, 'utf8') },
  );
}

function applyFixture(fixture: ReturnType<typeof createReleaseFixture>, version: string) {
  const result = runApplyFixture(fixture, version);
  if (result.status !== 0) throw new Error(result.stderr);
}

describe('release updater feed routing', () => {
  it('writes beta releases only to beta target feeds', () => {
    expect(feedTargetsForRelease('2.0.64-beta.1')).toEqual({
      channel: 'beta',
      targets: ['beta-darwin-aarch64', 'beta-darwin-x86_64', 'beta-windows-x86_64'],
    });
  });

  it('promotes stable content to beta feeds only when it is newer', () => {
    expect(feedTargetsForRelease('2.0.64', '2.0.64-beta.2').targets).toEqual([
      'stable-darwin-aarch64',
      'stable-darwin-x86_64',
      'stable-windows-x86_64',
      'beta-darwin-aarch64',
      'beta-darwin-x86_64',
      'beta-windows-x86_64',
    ]);
    expect(feedTargetsForRelease('2.0.63', '2.0.64-beta.1').targets).toEqual([
      'stable-darwin-aarch64',
      'stable-darwin-x86_64',
      'stable-windows-x86_64',
    ]);
  });

  it('uses the exact Tauri dynamic-response fields for a platform feed', () => {
    expect(
      createTargetManifest({
        version: '2.0.64-beta.1',
        notes: 'notes',
        pubDate: '2026-10-26T00:00:00Z',
        url: 'https://example.invalid/app.tar.gz',
        signature: 'c2ln',
      }),
    ).toEqual({
      version: '2.0.64-beta.1',
      notes: 'notes',
      pub_date: '2026-10-26T00:00:00Z',
      url: 'https://example.invalid/app.tar.gz',
      signature: 'c2ln',
    });
  });

  it('seeds missing stable feeds from legacy latest.json during a beta release', () => {
    const fixture = createReleaseFixture('2.0.64-beta.1');
    try {
      const legacy = createLegacyLatestManifest();
      const { content, latestPath } = writeLegacyLatest(fixture, legacy);

      applyFixture(fixture, '2.0.64-beta.1');

      for (const platform of platforms) {
        expect(
          JSON.parse(
            readFileSync(join(fixture.output, 'updates', `stable-${platform}.json`), 'utf8'),
          ),
        ).toEqual({
          version: legacy.version,
          notes: legacy.notes,
          pub_date: legacy.pub_date,
          url: legacy.platforms[platform].url,
          signature: legacy.platforms[platform].signature,
        });
      }
      expect(readFileSync(latestPath, 'utf8')).toBe(content);
    } finally {
      rmSync(fixture.root, { force: true, recursive: true });
    }
  });

  it('preserves existing stable feeds when seeding from legacy latest.json', () => {
    const fixture = createReleaseFixture('2.0.64-beta.1');
    try {
      const legacy = createLegacyLatestManifest();
      writeLegacyLatest(fixture, legacy);
      const updates = join(fixture.output, 'updates');
      mkdirSync(updates, { recursive: true });
      const existingStablePath = join(updates, 'stable-darwin-aarch64.json');
      const existingStableContent = '{\n  "version": "2.0.62",\n  "notes": "keep me"\n}\n';
      writeFileSync(existingStablePath, existingStableContent);

      applyFixture(fixture, '2.0.64-beta.1');

      expect(readFileSync(existingStablePath, 'utf8')).toBe(existingStableContent);
      for (const platform of platforms.slice(1)) {
        expect(
          JSON.parse(readFileSync(join(updates, `stable-${platform}.json`), 'utf8')).version,
        ).toBe(legacy.version);
      }
    } finally {
      rmSync(fixture.root, { force: true, recursive: true });
    }
  });

  it.each([
    ['invalid JSON', '{"version":', 'legacy latest.json is not valid JSON'],
    [
      'invalid version',
      { ...createLegacyLatestManifest(), version: 'invalid' },
      'legacy latest.json has an invalid version',
    ],
    [
      'prerelease version',
      { ...createLegacyLatestManifest(), version: '2.0.63-beta.1' },
      'legacy latest.json version must be stable',
    ],
    [
      'missing notes',
      Object.fromEntries(
        Object.entries(createLegacyLatestManifest()).filter(([key]) => key !== 'notes'),
      ),
      'legacy latest.json is missing notes',
    ],
    [
      'missing pub_date',
      Object.fromEntries(
        Object.entries(createLegacyLatestManifest()).filter(([key]) => key !== 'pub_date'),
      ),
      'legacy latest.json is missing pub_date',
    ],
    [
      'invalid pub_date',
      { ...createLegacyLatestManifest(), pub_date: 'not-a-date' },
      'legacy latest.json has an invalid pub_date',
    ],
    [
      'invalid calendar date',
      { ...createLegacyLatestManifest(), pub_date: '2026-02-31T14:30:00Z' },
      'legacy latest.json has an invalid pub_date',
    ],
    [
      'unannounced leap second',
      { ...createLegacyLatestManifest(), pub_date: '2016-12-30T23:59:60Z' },
      'legacy latest.json has an invalid pub_date',
    ],
    [
      'offset that does not map to a leap second',
      { ...createLegacyLatestManifest(), pub_date: '2017-01-01T00:59:60+02:00' },
      'legacy latest.json has an invalid pub_date',
    ],
    [
      'non-RFC3339 pub_date',
      { ...createLegacyLatestManifest(), pub_date: '2026-09-18T14:30:00' },
      'legacy latest.json has an invalid pub_date',
    ],
    [
      'missing platforms',
      Object.fromEntries(
        Object.entries(createLegacyLatestManifest()).filter(([key]) => key !== 'platforms'),
      ),
      'legacy latest.json is missing platforms',
    ],
    [
      'missing platform URL',
      {
        ...createLegacyLatestManifest(),
        platforms: {
          ...createLegacyLatestManifest().platforms,
          'darwin-aarch64': { signature: 'c2ln' },
        },
      },
      'legacy latest.json is missing the darwin-aarch64 URL',
    ],
    [
      'malformed platform URL',
      {
        ...createLegacyLatestManifest(),
        platforms: {
          ...createLegacyLatestManifest().platforms,
          'darwin-aarch64': { url: 'https://%', signature: 'c2ln' },
        },
      },
      'legacy latest.json has an invalid darwin-aarch64 URL',
    ],
    [
      'non-HTTPS platform URL',
      {
        ...createLegacyLatestManifest(),
        platforms: {
          ...createLegacyLatestManifest().platforms,
          'darwin-aarch64': {
            url: 'http://example.invalid/app.tar.gz',
            signature: 'c2ln',
          },
        },
      },
      'legacy latest.json has an invalid darwin-aarch64 URL',
    ],
    [
      'missing platform signature',
      {
        ...createLegacyLatestManifest(),
        platforms: {
          ...createLegacyLatestManifest().platforms,
          'darwin-aarch64': { url: 'https://example.invalid/app.tar.gz' },
        },
      },
      'legacy latest.json is missing the darwin-aarch64 signature',
    ],
    [
      'invalid platform signature',
      {
        ...createLegacyLatestManifest(),
        platforms: {
          ...createLegacyLatestManifest().platforms,
          'darwin-aarch64': {
            url: 'https://example.invalid/app.tar.gz',
            signature: 'not base64!',
          },
        },
      },
      'legacy latest.json has an invalid darwin-aarch64 signature',
    ],
    [
      'platform signature with invalid padding',
      {
        ...createLegacyLatestManifest(),
        platforms: {
          ...createLegacyLatestManifest().platforms,
          'darwin-aarch64': {
            url: 'https://example.invalid/app.tar.gz',
            signature: 'ab=',
          },
        },
      },
      'legacy latest.json has an invalid darwin-aarch64 signature',
    ],
  ])('rejects a legacy latest.json with %s', (_caseName, legacy, expectedError) => {
    const fixture = createReleaseFixture('2.0.64-beta.1');
    try {
      writeLegacyLatest(fixture, legacy);

      const result = runApplyFixture(fixture, '2.0.64-beta.1');

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(expectedError);
    } finally {
      rmSync(fixture.root, { force: true, recursive: true });
    }
  });

  it('rejects updater asset signatures with invalid base64 padding', () => {
    const fixture = createReleaseFixture('2.0.64-beta.1');
    try {
      writeFileSync(
        join(fixture.assets, 'MC-Vector_2.0.64-beta.1_darwin-aarch64.app.tar.gz.sig'),
        'ab=',
      );

      const result = runApplyFixture(fixture, '2.0.64-beta.1');

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Updater signature is not valid base64');
    } finally {
      rmSync(fixture.root, { force: true, recursive: true });
    }
  });

  it.each([
    ['UTC leap second', '2016-12-31T23:59:60Z'],
    ['equivalent offset leap second', '2017-01-01T00:59:60+01:00'],
  ])('accepts a known %s', (_caseName, pubDate) => {
    const fixture = createReleaseFixture('2.0.64-beta.1');
    try {
      writeLegacyLatest(fixture, { ...createLegacyLatestManifest(), pub_date: pubDate });

      applyFixture(fixture, '2.0.64-beta.1');

      expect(
        JSON.parse(
          readFileSync(join(fixture.output, 'updates', 'stable-darwin-aarch64.json'), 'utf8'),
        ).pub_date,
      ).toBe(pubDate);
    } finally {
      rmSync(fixture.root, { force: true, recursive: true });
    }
  });

  it('fails clearly when stable feeds are missing and legacy latest.json is absent', () => {
    const fixture = createReleaseFixture('2.0.64-beta.1');
    try {
      rmSync(join(fixture.output, 'latest.json'));

      const result = runApplyFixture(fixture, '2.0.64-beta.1');

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        'legacy latest.json is required to seed missing stable feeds',
      );
    } finally {
      rmSync(fixture.root, { force: true, recursive: true });
    }
  });

  it('updates stable target feeds and legacy latest.json for a stable release', () => {
    const fixture = createReleaseFixture('2.0.64');
    try {
      applyFixture(fixture, '2.0.64');

      for (const platform of platforms) {
        const feed = JSON.parse(
          readFileSync(join(fixture.output, 'updates', `stable-${platform}.json`), 'utf8'),
        );
        expect(feed).toMatchObject({
          version: '2.0.64',
          notes: 'release notes\n',
          pub_date: '2026-10-26T00:00:00Z',
          url: `https://example.invalid/release/MC-Vector_2.0.64_${assetSuffixes[platform]}`,
          signature: 'c2ln',
        });
      }
      const latest = JSON.parse(readFileSync(join(fixture.output, 'latest.json'), 'utf8'));
      expect(latest).toMatchObject({
        version: '2.0.64',
        notes: 'release notes\n',
        pub_date: '2026-10-26T00:00:00Z',
      });
      expect(Object.keys(latest.platforms)).toEqual([...platforms]);
    } finally {
      rmSync(fixture.root, { force: true, recursive: true });
    }
  });

  it('keeps beta feeds on a newer beta when an older stable is published', () => {
    const beta = createReleaseFixture('2.0.64-beta.2');
    try {
      applyFixture(beta, '2.0.64-beta.2');
      for (const asset of [
        'MC-Vector_2.0.63_darwin-aarch64.app.tar.gz',
        'MC-Vector_2.0.63_darwin-x86_64.app.tar.gz',
        'MC-Vector_2.0.63_windows-x86_64-setup.exe',
      ]) {
        writeFileSync(join(beta.assets, asset), 'artifact');
        writeFileSync(join(beta.assets, `${asset}.sig`), 'c2ln');
      }
      applyFixture(beta, '2.0.63');
      const betaManifest = JSON.parse(
        readFileSync(join(beta.output, 'updates', 'beta-darwin-aarch64.json'), 'utf8'),
      );
      expect(betaManifest.version).toBe('2.0.64-beta.2');
      expect(JSON.parse(readFileSync(join(beta.output, 'latest.json'), 'utf8')).version).toBe(
        '2.0.63',
      );
    } finally {
      rmSync(beta.root, { force: true, recursive: true });
    }
  });

  it('promotes stable assets to both channels when stable is newer than beta', () => {
    const fixture = createReleaseFixture('2.0.64-beta.2');
    try {
      applyFixture(fixture, '2.0.64-beta.2');
      for (const asset of [
        'MC-Vector_2.0.64_darwin-aarch64.app.tar.gz',
        'MC-Vector_2.0.64_darwin-x86_64.app.tar.gz',
        'MC-Vector_2.0.64_windows-x86_64-setup.exe',
      ]) {
        writeFileSync(join(fixture.assets, asset), 'artifact');
        writeFileSync(join(fixture.assets, `${asset}.sig`), 'c2ln');
      }
      applyFixture(fixture, '2.0.64');
      expect(
        JSON.parse(
          readFileSync(join(fixture.output, 'updates', 'beta-darwin-aarch64.json'), 'utf8'),
        ).version,
      ).toBe('2.0.64');
      expect(JSON.parse(readFileSync(join(fixture.output, 'latest.json'), 'utf8')).version).toBe(
        '2.0.64',
      );
    } finally {
      rmSync(fixture.root, { force: true, recursive: true });
    }
  });

  it('keeps promoting newer stable releases to beta after a stable promotion', () => {
    const fixture = createReleaseFixture('2.0.64-beta.2');
    try {
      applyFixture(fixture, '2.0.64-beta.2');
      for (const asset of [
        'MC-Vector_2.0.64_darwin-aarch64.app.tar.gz',
        'MC-Vector_2.0.64_darwin-x86_64.app.tar.gz',
        'MC-Vector_2.0.64_windows-x86_64-setup.exe',
      ]) {
        writeFileSync(join(fixture.assets, asset), 'artifact');
        writeFileSync(join(fixture.assets, `${asset}.sig`), 'c2ln');
      }
      applyFixture(fixture, '2.0.64');

      for (const asset of [
        'MC-Vector_2.0.65_darwin-aarch64.app.tar.gz',
        'MC-Vector_2.0.65_darwin-x86_64.app.tar.gz',
        'MC-Vector_2.0.65_windows-x86_64-setup.exe',
      ]) {
        writeFileSync(join(fixture.assets, asset), 'artifact');
        writeFileSync(join(fixture.assets, `${asset}.sig`), 'c2ln');
      }
      applyFixture(fixture, '2.0.65');

      expect(
        JSON.parse(
          readFileSync(join(fixture.output, 'updates', 'beta-darwin-aarch64.json'), 'utf8'),
        ).version,
      ).toBe('2.0.65');
    } finally {
      rmSync(fixture.root, { force: true, recursive: true });
    }
  });
});
