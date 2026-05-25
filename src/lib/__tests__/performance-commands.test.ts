import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauriInvokeMock = vi.fn();

vi.mock('../tauri-api', () => ({
  tauriInvoke: tauriInvokeMock,
  tauriListen: vi.fn(),
}));

describe('performance-commands', () => {
  beforeEach(() => {
    vi.resetModules();
    tauriInvokeMock.mockReset();
  });

  describe('parseAnsiLines', () => {
    it('returns parsed ANSI segments for each line', async () => {
      const parsed = [
        [{ text: 'INFO', color: '#00ff00', backgroundColor: null, fontWeight: null }],
        [{ text: 'WARN', color: '#ffff00', backgroundColor: null, fontWeight: 700 }],
      ];
      tauriInvokeMock.mockResolvedValueOnce(parsed);
      const { parseAnsiLines } = await import('../performance-commands');
      const result = await parseAnsiLines(['INFO', 'WARN']);
      expect(tauriInvokeMock).toHaveBeenCalledWith('parse_ansi_lines', {
        lines: ['INFO', 'WARN'],
      });
      expect(result).toEqual(parsed);
    });

    it('returns empty array for empty input', async () => {
      tauriInvokeMock.mockResolvedValueOnce([]);
      const { parseAnsiLines } = await import('../performance-commands');
      const result = await parseAnsiLines([]);
      expect(tauriInvokeMock).toHaveBeenCalledWith('parse_ansi_lines', { lines: [] });
      expect(result).toEqual([]);
    });

    it('returns null color for plain text without ANSI codes', async () => {
      const parsed = [
        [{ text: 'plain text', color: null, backgroundColor: null, fontWeight: null }],
      ];
      tauriInvokeMock.mockResolvedValueOnce(parsed);
      const { parseAnsiLines } = await import('../performance-commands');
      const result = await parseAnsiLines(['plain text']);
      expect(result[0][0].color).toBeNull();
      expect(result[0][0].text).toBe('plain text');
    });
  });
});
