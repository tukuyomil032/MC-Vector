import {
  classifyPluginInstallFailure,
  decodePluginInstallFailure,
} from '@/lib/plugin-install-errors';
import { describe, expect, it } from 'vitest';

const expected = {
  'unverified-artifact-blocked': {
    category: 'security',
    result: 'blocked',
  },
  'checksum-mismatch': {
    category: 'integrity',
    result: 'rejected',
  },
  'checksum-invalid': {
    category: 'integrity',
    result: 'rejected',
  },
  'source-rejected': {
    category: 'source',
    result: 'rejected',
  },
  'destination-rejected': {
    category: 'destination',
    result: 'rejected',
  },
  'size-limit-exceeded': {
    category: 'size',
    result: 'rejected',
  },
  network: {
    category: 'network',
    result: 'retryable',
  },
  unknown: {
    category: 'unknown',
    result: 'unknown',
  },
} as const;

function expectFailure(code: keyof typeof expected, thrown: unknown) {
  expect(classifyPluginInstallFailure(thrown)).toEqual({
    code,
    ...expected[code],
  });
}

describe('classifyPluginInstallFailure', () => {
  it('classifies checksum-required hashless downloads as blocked', () => {
    expectFailure(
      'unverified-artifact-blocked',
      'Plugin download rejected: checksum is required. Set allowUnverifiedPluginDownloads to true in config.json only when you explicitly accept an unverified artifact.',
    );
  });

  it('classifies a checksum mismatch from an Error instance', () => {
    expectFailure(
      'checksum-mismatch',
      new Error('SHA256 checksum mismatch: expected abc, got def'),
    );
  });

  it('classifies invalid and unsupported checksum errors', () => {
    expectFailure('checksum-invalid', 'Invalid SHA256 checksum');
    expectFailure(
      'checksum-invalid',
      'Unsupported checksum algorithm; expected sha1, sha256, or sha512',
    );
  });

  it('classifies URL and provider validation errors as source rejection', () => {
    expectFailure('source-rejected', 'Unsupported plugin download provider');
    expectFailure('source-rejected', 'Download URL host is not approved for this provider');
    expectFailure('source-rejected', 'Download URL must use HTTPS');
  });

  it('classifies managed path and destination errors as destination rejection', () => {
    expectFailure('destination-rejected', 'Plugin destination must not be a symlink');
    expectFailure('destination-rejected', 'Invalid server ID');
    expectFailure(
      'destination-rejected',
      'Path is outside the managed root: /Users/example/server/plugins/test.jar',
    );
    expectFailure(
      'destination-rejected',
      'Download destination must not be a symbolic link or reparse point',
    );
  });

  it('classifies content and stream size limits', () => {
    expectFailure('size-limit-exceeded', 'Download exceeds the 512-byte limit');
    expectFailure('size-limit-exceeded', 'Download size overflow');
  });

  it('classifies request, HTTP, stalled, and stream failures as retryable network errors', () => {
    expectFailure('network', new Error('HTTP request failed: connection reset'));
    expectFailure('network', 'HTTP error: 503 Service Unavailable');
    expectFailure('network', 'Download stalled while waiting for data');
    expectFailure('network', 'Download stream error: connection closed');
  });

  it('decodes JSON strings and object-shaped Tauri errors', () => {
    expectFailure(
      'checksum-mismatch',
      JSON.stringify({ message: 'sha256 checksum mismatch: expected secret, got actual' }),
    );
    expectFailure('source-rejected', {
      error: { message: 'Invalid download URL: https://private.example/file.jar' },
    });
  });

  it('accepts a known stable code from an object without exposing other fields', () => {
    expectFailure('network', {
      code: 'network',
      message: 'private path and internal diagnostics',
    });
  });

  it('keeps malformed and unknown values unknown', () => {
    for (const value of [
      undefined,
      null,
      404,
      Symbol('failure'),
      () => 'Download exceeds the limit',
      '{"message":',
      { code: 'ERR_DOWNLOAD', detail: 'not a recognized stable code' },
      { code: 'toString' },
      'toString',
      { unexpected: 'HTTP request failed' },
      new Error(),
    ]) {
      expectFailure('unknown', value);
    }
  });

  it('returns only safe classification data for sensitive errors', () => {
    const result = classifyPluginInstallFailure(
      new Error(
        'Download failed for https://private.example/artifact.jar at /Users/private/server/plugins/a.jar; checksum mismatch: expected secret, got actual',
      ),
    );

    expect(result).toEqual({
      code: 'checksum-mismatch',
      ...expected['checksum-mismatch'],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /private\.example|\/Users\/private|secret|actual|Download failed/,
    );
  });

  it('exposes the decoder alias', () => {
    expect(decodePluginInstallFailure('Download stalled while waiting for data')).toEqual(
      classifyPluginInstallFailure('Download stalled while waiting for data'),
    );
  });

  it('recognizes a stable code encoded as a JSON string', () => {
    expectFailure('network', JSON.stringify('network'));
  });

  it('recognizes the structured JSON error returned by the Rust command', () => {
    expectFailure(
      'unverified-artifact-blocked',
      JSON.stringify({
        code: 'unverified-artifact-blocked',
        message: 'private URL and checksum details',
      }),
    );
  });
});
