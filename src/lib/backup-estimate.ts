/** How many of the newest backups with a recorded duration feed the estimate. */
export const ESTIMATE_SAMPLE_COUNT = 5;

export interface BackupDurationSample {
  /** Bytes the archive covered. */
  size: number;
  durationMs?: number | null;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Estimates how long a backup of `targetBytes` will take, from the throughput of past backups.
 *
 * `history` is newest first, as the backup list is. Only the newest ESTIMATE_SAMPLE_COUNT entries with a
 * usable duration count; each gives bytes per millisecond, and the median of those is the speed used.
 * Returns null when there is no usable history, so callers can hide the estimate instead of guessing.
 */
export function estimateBackupDurationMs(
  targetBytes: number,
  history: readonly BackupDurationSample[],
): number | null {
  if (!Number.isFinite(targetBytes) || targetBytes < 0) {
    return null;
  }

  const throughputs: number[] = [];
  for (const entry of history) {
    if (throughputs.length >= ESTIMATE_SAMPLE_COUNT) {
      break;
    }
    const duration = entry.durationMs ?? 0;
    if (!(duration > 0) || !(entry.size > 0)) {
      continue;
    }
    throughputs.push(entry.size / duration);
  }
  if (throughputs.length === 0) {
    return null;
  }

  const bytesPerMs = median(throughputs);
  if (!(bytesPerMs > 0)) {
    return null;
  }
  return Math.round(targetBytes / bytesPerMs);
}
