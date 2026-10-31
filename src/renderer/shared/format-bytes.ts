const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
const BASE = 1024;

/**
 * Formats a byte count with the largest unit that keeps the number under 1024. Bytes are whole numbers;
 * larger units show one decimal at most. Digits follow the locale. A value that would round up to 1024 moves to the next unit.
 */
export function formatBytes(bytes: number, locale?: string): string {
  const safe = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;

  const roundFor = (value: number, unit: number) =>
    unit === 0 ? Math.round(value) : Math.round(value * 10) / 10;

  let unit = 0;
  let value = safe;
  while (unit < UNITS.length - 1 && roundFor(value, unit) >= BASE) {
    value /= BASE;
    unit += 1;
  }

  const formatter = new Intl.NumberFormat(locale, {
    maximumFractionDigits: unit === 0 ? 0 : 1,
  });
  return `${formatter.format(roundFor(value, unit))} ${UNITS[unit]}`;
}
