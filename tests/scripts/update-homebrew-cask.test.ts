import { describe, expect, it } from 'vitest';
// @ts-ignore The release helper is JavaScript and is exercised directly by Vitest.
import * as homebrewCask from '../../scripts/update-homebrew-cask.mjs';

const { updateCaskSource } = homebrewCask;

const source = `cask 'mc-vector' do
  version "2.0.63"
  sha256 arm:   "${'a'.repeat(64)}",
         intel: "${'b'.repeat(64)}"
end
`;

describe('Homebrew Cask release sync', () => {
  it('updates the stable version and both architecture checksums', () => {
    const armSha256 = 'c'.repeat(64);
    const intelSha256 = 'd'.repeat(64);

    const result = updateCaskSource(source, '2.0.64', armSha256, intelSha256);

    expect(result.changed).toBe(true);
    expect(result.source).toContain('version "2.0.64"');
    expect(result.source).toContain(`sha256 arm:   "${armSha256}",`);
    expect(result.source).toContain(`intel: "${intelSha256}"`);

    const verification = updateCaskSource(result.source, '2.0.64', armSha256, intelSha256);
    expect(verification.changed).toBe(false);
    expect(verification.reason).toBe('unchanged');
  });

  it('does not roll the Cask back for an older release workflow run', () => {
    const result = updateCaskSource(source, '2.0.62', 'c'.repeat(64), 'd'.repeat(64));

    expect(result.changed).toBe(false);
    expect(result.reason).toBe('older_version');
    expect(result.source).toBe(source);
  });

  it('rejects prereleases so Beta never updates the Stable Cask', () => {
    expect(() => updateCaskSource(source, '2.0.64-beta.1', 'c'.repeat(64), 'd'.repeat(64))).toThrow(
      'only tracks stable releases',
    );
  });

  it.each([
    ['arm', 'not-a-hash', 'd'.repeat(64)],
    ['intel', 'c'.repeat(64), 'not-a-hash'],
  ])(
    'rejects malformed %s checksum rather than writing an invalid Cask',
    (architecture, arm, intel) => {
      expect(() => updateCaskSource(source, '2.0.64', arm, intel)).toThrow(
        `${architecture} SHA-256 must be a 64-character SHA-256 digest.`,
      );
    },
  );
});
