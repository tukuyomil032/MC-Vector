import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauriInvokeMock = vi.fn();

vi.mock('../tauri-api', () => ({
  tauriInvoke: tauriInvokeMock,
  tauriListen: vi.fn(),
}));

describe('security-commands', () => {
  beforeEach(() => {
    vi.resetModules();
    tauriInvokeMock.mockReset();
  });

  describe('sanitizeLog', () => {
    it('returns sanitized string on valid response', async () => {
      tauriInvokeMock.mockResolvedValueOnce({ sanitized: 'clean log line' });
      const { sanitizeLog } = await import('../security-commands');
      const result = await sanitizeLog('[WARN] raw input');
      expect(tauriInvokeMock).toHaveBeenCalledWith('security_gateway', {
        action: 'sanitize_log',
        payload: { input: '[WARN] raw input' },
      });
      expect(result).toBe('clean log line');
    });

    it('throws when sanitized field is missing', async () => {
      tauriInvokeMock.mockResolvedValueOnce({});
      const { sanitizeLog } = await import('../security-commands');
      await expect(sanitizeLog('bad input')).rejects.toThrow('invalid payload');
    });
  });

  describe('authorizeAction', () => {
    it('returns true when allowed', async () => {
      tauriInvokeMock.mockResolvedValueOnce({ allowed: true });
      const { authorizeAction } = await import('../security-commands');
      const result = await authorizeAction('admin', 'start_server');
      expect(tauriInvokeMock).toHaveBeenCalledWith('security_gateway', {
        action: 'authorize_action',
        payload: { role: 'admin', action: 'start_server' },
      });
      expect(result).toBe(true);
    });

    it('throws when not allowed', async () => {
      tauriInvokeMock.mockResolvedValueOnce({ allowed: false });
      const { authorizeAction } = await import('../security-commands');
      await expect(authorizeAction('viewer', 'start_server')).rejects.toThrow('invalid payload');
    });
  });

  describe('checkRateLimit', () => {
    it('returns true when within rate limit', async () => {
      tauriInvokeMock.mockResolvedValueOnce({ allowed: true });
      const { checkRateLimit } = await import('../security-commands');
      const result = await checkRateLimit('user-1');
      expect(tauriInvokeMock).toHaveBeenCalledWith('security_gateway', {
        action: 'rate_limit_check',
        payload: { userId: 'user-1' },
      });
      expect(result).toBe(true);
    });

    it('throws when rate limit exceeded', async () => {
      tauriInvokeMock.mockResolvedValueOnce({ allowed: false });
      const { checkRateLimit } = await import('../security-commands');
      await expect(checkRateLimit('user-1')).rejects.toThrow('invalid payload');
    });
  });

  describe('validateSafeCommand', () => {
    it('returns validated command with args', async () => {
      tauriInvokeMock.mockResolvedValueOnce({
        allowed: true,
        program: 'java',
        args: ['-jar', 'server.jar'],
      });
      const { validateSafeCommand } = await import('../security-commands');
      const result = await validateSafeCommand('java', ['-jar', 'server.jar']);
      expect(tauriInvokeMock).toHaveBeenCalledWith('security_gateway', {
        action: 'validate_safe_command',
        payload: { program: 'java', args: ['-jar', 'server.jar'] },
      });
      expect(result).toEqual({ program: 'java', args: ['-jar', 'server.jar'] });
    });

    it('uses empty array as default args', async () => {
      tauriInvokeMock.mockResolvedValueOnce({ allowed: true, program: 'java', args: [] });
      const { validateSafeCommand } = await import('../security-commands');
      await validateSafeCommand('java');
      expect(tauriInvokeMock).toHaveBeenCalledWith('security_gateway', {
        action: 'validate_safe_command',
        payload: { program: 'java', args: [] },
      });
    });

    it('throws when allowed is false', async () => {
      tauriInvokeMock.mockResolvedValueOnce({ allowed: false, program: 'rm', args: ['-rf'] });
      const { validateSafeCommand } = await import('../security-commands');
      await expect(validateSafeCommand('rm', ['-rf'])).rejects.toThrow('invalid payload');
    });

    it('throws when args is not an array', async () => {
      tauriInvokeMock.mockResolvedValueOnce({ allowed: true, program: 'java', args: 'bad' });
      const { validateSafeCommand } = await import('../security-commands');
      await expect(validateSafeCommand('java')).rejects.toThrow('invalid payload');
    });
  });

  describe('resolveSafePath', () => {
    it('returns resolved path', async () => {
      tauriInvokeMock.mockResolvedValueOnce({ resolvedPath: '/servers/server-1/world' });
      const { resolveSafePath } = await import('../security-commands');
      const result = await resolveSafePath('/servers/server-1', 'world');
      expect(tauriInvokeMock).toHaveBeenCalledWith('security_gateway', {
        action: 'resolve_safe_path',
        payload: { base: '/servers/server-1', input: 'world' },
      });
      expect(result).toBe('/servers/server-1/world');
    });

    it('throws when resolvedPath is missing', async () => {
      tauriInvokeMock.mockResolvedValueOnce({});
      const { resolveSafePath } = await import('../security-commands');
      await expect(resolveSafePath('/base', '../escape')).rejects.toThrow('invalid payload');
    });
  });

  describe('logAuditAction', () => {
    it('returns audit entry on valid response', async () => {
      const now = Date.now();
      tauriInvokeMock.mockResolvedValueOnce({
        logged: true,
        entry: { user: 'admin', action: 'start_server', timestamp: now },
      });
      const { logAuditAction } = await import('../security-commands');
      const result = await logAuditAction('admin', 'start_server');
      expect(tauriInvokeMock).toHaveBeenCalledWith('security_gateway', {
        action: 'audit_log',
        payload: { user: 'admin', action: 'start_server' },
      });
      expect(result).toEqual({ user: 'admin', action: 'start_server', timestamp: now });
    });

    it('throws when logged is false', async () => {
      tauriInvokeMock.mockResolvedValueOnce({
        logged: false,
        entry: { user: 'u', action: 'a', timestamp: 0 },
      });
      const { logAuditAction } = await import('../security-commands');
      await expect(logAuditAction('u', 'a')).rejects.toThrow('invalid payload');
    });

    it('throws when entry fields are incomplete', async () => {
      tauriInvokeMock.mockResolvedValueOnce({ logged: true, entry: { user: 'admin' } });
      const { logAuditAction } = await import('../security-commands');
      await expect(logAuditAction('admin', 'action')).rejects.toThrow('invalid payload');
    });
  });
});
