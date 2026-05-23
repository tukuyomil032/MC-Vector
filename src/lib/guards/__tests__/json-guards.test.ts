import { describe, expect, it } from 'vitest';
import { asNumber, asString, isRecord } from '../json-guards';

describe('isRecord', () => {
  it('returns true for a plain object', () => {
    expect(isRecord({ key: 'value' })).toBe(true);
  });

  it('returns true for an empty object', () => {
    expect(isRecord({})).toBe(true);
  });

  it('returns true for arrays (arrays are objects)', () => {
    expect(isRecord([])).toBe(true);
  });

  it('returns false for null', () => {
    expect(isRecord(null)).toBe(false);
  });

  it('returns false for a string', () => {
    expect(isRecord('hello')).toBe(false);
  });

  it('returns false for a number', () => {
    expect(isRecord(42)).toBe(false);
  });

  it('returns false for a boolean', () => {
    expect(isRecord(true)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isRecord(undefined)).toBe(false);
  });
});

describe('asString', () => {
  it('returns the value when given a string', () => {
    expect(asString('hello')).toBe('hello');
  });

  it('returns empty string fallback for a number', () => {
    expect(asString(42)).toBe('');
  });

  it('returns empty string fallback for null', () => {
    expect(asString(null)).toBe('');
  });

  it('returns empty string fallback for undefined', () => {
    expect(asString(undefined)).toBe('');
  });

  it('returns empty string fallback for an object', () => {
    expect(asString({})).toBe('');
  });

  it('returns custom fallback for non-string', () => {
    expect(asString(42, 'default')).toBe('default');
  });

  it('returns the string value even when custom fallback is given', () => {
    expect(asString('actual', 'default')).toBe('actual');
  });
});

describe('asNumber', () => {
  it('returns the value for a finite number', () => {
    expect(asNumber(42)).toBe(42);
  });

  it('returns the value for a negative finite number', () => {
    expect(asNumber(-7)).toBe(-7);
  });

  it('returns the value for 0', () => {
    expect(asNumber(0)).toBe(0);
  });

  it('returns fallback for NaN', () => {
    expect(asNumber(Number.NaN)).toBe(0);
  });

  it('returns fallback for Infinity', () => {
    expect(asNumber(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('returns fallback for -Infinity', () => {
    expect(asNumber(Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it('returns fallback for a string', () => {
    expect(asNumber('42')).toBe(0);
  });

  it('returns fallback for null', () => {
    expect(asNumber(null)).toBe(0);
  });

  it('returns custom fallback when given', () => {
    expect(asNumber('bad', -1)).toBe(-1);
  });
});
