import { formatBytes } from '@/renderer/shared/format-bytes';
import { describe, expect, it } from 'vitest';

describe('formatBytes', () => {
  it('shows whole bytes without decimals', () => {
    expect(formatBytes(0, 'en-US')).toBe('0 B');
    expect(formatBytes(512, 'en-US')).toBe('512 B');
    expect(formatBytes(1023, 'en-US')).toBe('1,023 B');
  });

  it('picks the largest unit and keeps at most one decimal', () => {
    expect(formatBytes(1024, 'en-US')).toBe('1 KB');
    expect(formatBytes(1536, 'en-US')).toBe('1.5 KB');
    expect(formatBytes(52_428_800, 'en-US')).toBe('50 MB');
    expect(formatBytes(3 * 1024 ** 3, 'en-US')).toBe('3 GB');
    expect(formatBytes(2 * 1024 ** 4, 'en-US')).toBe('2 TB');
  });

  it('moves to the next unit when rounding would reach 1024', () => {
    // 1023.96 KB rounds to 1024.0 at one decimal, so it reads as 1 MB.
    expect(formatBytes(1023.96 * 1024, 'en-US')).toBe('1 MB');
    expect(formatBytes(1024 ** 2 - 1, 'en-US')).toBe('1 MB');
  });

  it('stays in TB for very large values instead of inventing a unit', () => {
    expect(formatBytes(5000 * 1024 ** 4, 'en-US')).toBe('5,000 TB');
  });

  it('formats digits with the locale', () => {
    expect(formatBytes(1536, 'de-DE')).toBe('1,5 KB');
    expect(formatBytes(1536, 'en-US')).toBe('1.5 KB');
  });

  it('treats negative and non-finite input as zero', () => {
    expect(formatBytes(-10, 'en-US')).toBe('0 B');
    expect(formatBytes(Number.NaN, 'en-US')).toBe('0 B');
    expect(formatBytes(Number.POSITIVE_INFINITY, 'en-US')).toBe('0 B');
  });
});
