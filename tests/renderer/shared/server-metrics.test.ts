import { describe, expect, it } from 'vitest';
import {
  createMetricDisplaySeries,
  formatMetricUptime,
  getMetricTimeDomain,
  getMetricTimeTicks,
  getMetricWindowPoints,
  isMetricHistorySnapshot,
} from '@/renderer/shared/server-metrics';

describe('server metric display', () => {
  it('leaves an empty display series empty', () => {
    expect(createMetricDisplaySeries([], 5_000)).toEqual([]);
  });

  it('extends one measurement with a marked display-only endpoint', () => {
    const sample = { elapsedMs: 1_000, cpu: 31 };

    expect(createMetricDisplaySeries([sample], 3_000)).toEqual([
      sample,
      {
        ...sample,
        elapsedMs: 3_000,
        displayOnly: true,
        measuredAtElapsedMs: 1_000,
      },
    ]);
  });

  it('extends multiple measurements from the latest actual sample', () => {
    const samples = [
      { elapsedMs: 1_000, tps: 20 },
      { elapsedMs: 4_000, tps: 18.5 },
    ];

    expect(createMetricDisplaySeries(samples, 5_000)).toEqual([
      ...samples,
      {
        ...samples[1],
        elapsedMs: 5_000,
        displayOnly: true,
        measuredAtElapsedMs: 4_000,
      },
    ]);
  });

  it('uses only the latest pre-window point as a tagged anchor before in-window samples', () => {
    const samples = [
      { elapsedMs: 0, cpu: 10 },
      { elapsedMs: 10_000, cpu: 20 },
      { elapsedMs: 20_000, cpu: 30 },
      { elapsedMs: 40_000, cpu: 40 },
    ];

    expect(createMetricDisplaySeries(samples, 80_000)).toEqual([
      {
        ...samples[1],
        displayOnly: true,
        measuredAtElapsedMs: 10_000,
        windowAnchor: true,
      },
      samples[2],
      samples[3],
      {
        ...samples[3],
        elapsedMs: 80_000,
        displayOnly: true,
        measuredAtElapsedMs: 40_000,
      },
    ]);
  });

  it('keeps an anchor-only series without inventing a current point', () => {
    const samples = [
      { elapsedMs: 1_000, tps: 16 },
      { elapsedMs: 19_000, tps: 18 },
    ];

    expect(createMetricDisplaySeries(samples, 80_000)).toEqual([
      {
        ...samples[1],
        displayOnly: true,
        measuredAtElapsedMs: 19_000,
        windowAnchor: true,
      },
    ]);
  });

  it('returns only samples inside the current time domain for readouts', () => {
    const samples = [
      { elapsedMs: 0, cpu: 10 },
      { elapsedMs: 19_999, cpu: 20 },
      { elapsedMs: 20_000, cpu: 30 },
      { elapsedMs: 80_001, cpu: 40 },
    ];

    expect(getMetricWindowPoints(samples, 80_000)).toEqual([samples[2]]);
  });

  it('does not append an endpoint when now is at the latest sample', () => {
    const samples = [{ elapsedMs: 4_000, memory: 256 }];

    expect(createMetricDisplaySeries(samples, 4_000)).toEqual(samples);
    expect(createMetricDisplaySeries(samples, 3_000)).toEqual([]);
  });

  it('does not mutate the input samples', () => {
    const samples = Object.freeze([
      Object.freeze({ elapsedMs: 2_000, cpu: 45 }),
      Object.freeze({ elapsedMs: 4_000, cpu: 50 }),
    ]);
    const before = samples.map((point) => ({ ...point }));

    createMetricDisplaySeries(samples, 6_000);

    expect(samples).toEqual(before);
    expect(samples[1]).not.toHaveProperty('displayOnly');
  });

  it('uses an elapsed-time window that grows from startup and follows the last sixty seconds', () => {
    expect(getMetricTimeDomain(0)).toEqual([0, 1_000]);
    expect(getMetricTimeDomain(8_000)).toEqual([0, 8_000]);
    expect(getMetricTimeDomain(120_000)).toEqual([60_000, 120_000]);
    expect(getMetricTimeTicks([60_000, 120_000])).toEqual([
      60_000, 70_000, 80_000, 90_000, 100_000, 110_000, 120_000,
    ]);
    expect(formatMetricUptime(3_661_999)).toBe('01:01:01');
  });

  it('rejects invalid snapshots before they reach the charts', () => {
    const value = {
      serverId: 'server-a',
      generation: 1,
      sequence: 0,
      elapsedMs: 0,
      resource: [],
      tps: [],
    };
    expect(isMetricHistorySnapshot(value)).toBe(true);
    expect(
      isMetricHistorySnapshot({
        ...value,
        resource: [{ elapsedMs: 1, cpu: Number.NaN, memory: 1 }],
      }),
    ).toBe(false);
    expect(isMetricHistorySnapshot({ ...value, generation: -1 })).toBe(false);
  });
});
