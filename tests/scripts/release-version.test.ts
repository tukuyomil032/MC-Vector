import { describe, expect, it } from 'vitest';
// @ts-ignore The release helper is JavaScript and is exercised directly by Vitest.
import * as releaseVersion from '../../scripts/release-version.mjs';

const { compareVersions, normalizeVersion, releasePrerelease, selectChangelogBase } =
  releaseVersion;

describe('release version ordering', () => {
  it('accepts beta versions and promotes a stable release after the beta series', () => {
    expect(normalizeVersion('v2.0.64-beta.2')).toBe('2.0.64-beta.2');
    expect(compareVersions('2.0.64-beta.2', '2.0.64-beta.1')).toBeGreaterThan(0);
    expect(compareVersions('2.0.64', '2.0.64-beta.9')).toBeGreaterThan(0);
    expect(releasePrerelease('2.0.64-beta.1')).toBe(true);
    expect(releasePrerelease('2.0.64')).toBe(false);
  });
});

describe('changelog base selection', () => {
  const releases = [
    { tag_name: 'v2.0.62', draft: false, prerelease: false, published_at: '2026-01-01T00:00:00Z' },
    { tag_name: 'v2.0.63', draft: false, prerelease: false, published_at: '2026-02-01T00:00:00Z' },
    {
      tag_name: 'v2.0.64-beta.1',
      draft: false,
      prerelease: true,
      published_at: '2026-03-01T00:00:00Z',
    },
    {
      tag_name: 'v2.0.64-beta.2',
      draft: false,
      prerelease: true,
      published_at: '2026-03-02T00:00:00Z',
    },
  ];

  it('increments beta notes from the prior beta, then starts beta.1 at stable', () => {
    expect(selectChangelogBase('2.0.64-beta.1', releases)).toBe('v2.0.63');
    expect(selectChangelogBase('2.0.64-beta.2', releases)).toBe('v2.0.64-beta.1');
  });

  it('bases stable promotion on the newest published stable tag, never a beta tag', () => {
    expect(selectChangelogBase('2.0.64', releases)).toBe('v2.0.63');
  });
});
