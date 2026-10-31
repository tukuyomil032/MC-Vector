import { describe, expect, it } from 'vitest';
import { ESTIMATE_SAMPLE_COUNT, estimateBackupDurationMs } from '@/lib/backup-estimate';

describe('estimateBackupDurationMs', () => {
  it('returns null when there is no backup history to learn from', () => {
    expect(estimateBackupDurationMs(1_000_000, [])).toBeNull();
  });

  it('returns null when no past backup recorded a usable duration', () => {
    expect(
      estimateBackupDurationMs(1_000_000, [
        { size: 500, durationMs: undefined },
        { size: 500, durationMs: null },
        { size: 500, durationMs: 0 },
        { size: 0, durationMs: 1000 },
      ]),
    ).toBeNull();
  });

  it('scales the target size by the throughput of one past backup', () => {
    // 1 MB in 2 s is 500 bytes per ms; 5 MB then takes 10 s.
    expect(estimateBackupDurationMs(5_000_000, [{ size: 1_000_000, durationMs: 2000 }])).toBe(
      10_000,
    );
  });

  it('uses the median throughput, so one slow outlier does not dominate', () => {
    const history = [
      { size: 1000, durationMs: 1000 }, // 1 byte/ms
      { size: 1000, durationMs: 1000 }, // 1 byte/ms
      { size: 1000, durationMs: 100_000 }, // 0.01 byte/ms, an outlier
    ];
    expect(estimateBackupDurationMs(100, history)).toBe(100);
  });

  it('averages the two middle samples when the count is even', () => {
    const history = [
      { size: 1000, durationMs: 1000 }, // 1 byte/ms
      { size: 3000, durationMs: 1000 }, // 3 bytes/ms
    ];
    // median throughput is 2 bytes/ms, so 600 bytes take 300 ms.
    expect(estimateBackupDurationMs(600, history)).toBe(300);
  });

  it('only looks at the newest five usable backups', () => {
    // Newest first. The first five run at 1 byte/ms; the older one at 100 bytes/ms must be ignored.
    const newest = Array.from({ length: ESTIMATE_SAMPLE_COUNT }, () => ({
      size: 1000,
      durationMs: 1000,
    }));
    const older = { size: 100_000, durationMs: 1000 };
    expect(estimateBackupDurationMs(1000, [...newest, older])).toBe(1000);
  });

  it('skips unusable entries without counting them toward the five', () => {
    const history = [
      { size: 1000, durationMs: undefined },
      { size: 1000, durationMs: 1000 },
      { size: 1000, durationMs: 1000 },
      { size: 1000, durationMs: 1000 },
      { size: 1000, durationMs: 1000 },
      { size: 1000, durationMs: 1000 },
      { size: 1000, durationMs: 500_000 },
    ];
    // Five usable samples at 1 byte/ms; the trailing slow one is beyond the window.
    expect(estimateBackupDurationMs(2000, history)).toBe(2000);
  });

  it('returns zero for an empty target and rejects invalid sizes', () => {
    const history = [{ size: 1000, durationMs: 1000 }];
    expect(estimateBackupDurationMs(0, history)).toBe(0);
    expect(estimateBackupDurationMs(-1, history)).toBeNull();
    expect(estimateBackupDurationMs(Number.NaN, history)).toBeNull();
  });
});
