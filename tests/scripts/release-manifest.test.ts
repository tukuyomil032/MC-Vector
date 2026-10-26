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
  writeFileSync(notes, 'release notes\n');
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

function applyFixture(fixture: ReturnType<typeof createReleaseFixture>, version: string) {
  const result = spawnSync(
    process.execPath,
    [manifestScript, 'apply', version, '2026-10-26T00:00:00Z', 'https://example.invalid/release'],
    { cwd: fixture.root, encoding: 'utf8', input: readFileSync(fixture.notes, 'utf8') },
  );
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
