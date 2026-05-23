import { beforeEach, describe, expect, it, vi } from 'vitest';
import { logError, toErrorMessage } from '../error-utils';

describe('toErrorMessage', () => {
  it('returns error.message for an Error instance', () => {
    const err = new Error('something went wrong');
    expect(toErrorMessage(err)).toBe('something went wrong');
  });

  it('converts a string to itself', () => {
    expect(toErrorMessage('plain string error')).toBe('plain string error');
  });

  it('converts a number to its string representation', () => {
    expect(toErrorMessage(404)).toBe('404');
  });

  it('converts null to "null"', () => {
    expect(toErrorMessage(null)).toBe('null');
  });

  it('converts undefined to "undefined"', () => {
    expect(toErrorMessage(undefined)).toBe('undefined');
  });

  it('converts an object to its string representation', () => {
    expect(toErrorMessage({ code: 'ERR' })).toBe('[object Object]');
  });
});

describe('logError', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('calls console.error with context and error when no extra is given', () => {
    const err = new Error('oops');
    logError('TestContext', err);
    expect(console.error).toHaveBeenCalledWith('TestContext', err);
  });

  it('calls console.error with merged extra fields when extra is given', () => {
    const err = new Error('oops');
    logError('TestContext', err, { serverId: 'srv-1' });
    expect(console.error).toHaveBeenCalledWith('TestContext', {
      serverId: 'srv-1',
      error: 'oops',
    });
  });

  it('includes non-Error message in extra object', () => {
    logError('Ctx', 'raw string error', { phase: 'boot' });
    expect(console.error).toHaveBeenCalledWith('Ctx', {
      phase: 'boot',
      error: 'raw string error',
    });
  });
});
