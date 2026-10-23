import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauriInvokeMock = vi.fn();

vi.mock('@/lib/tauri-api', () => ({
  tauriInvoke: tauriInvokeMock,
  tauriListen: vi.fn(),
}));

describe('performance-commands', () => {
  beforeEach(() => {
    vi.resetModules();
    tauriInvokeMock.mockReset();
  });

  describe('parseAnsiLines', () => {
    // The ANSI parsing itself is tested in Rust (src-tauri/src/commands/perf.rs).
    it('forwards the lines to parse_ansi_lines and returns the IPC result', async () => {
      const parsed = [
        [{ text: 'INFO', color: '#00ff00', backgroundColor: null, fontWeight: null }],
        [{ text: 'WARN', color: '#ffff00', backgroundColor: null, fontWeight: 700 }],
      ];
      tauriInvokeMock.mockResolvedValueOnce(parsed);
      const { parseAnsiLines } = await import('@/lib/performance-commands');
      const result = await parseAnsiLines(['INFO', 'WARN']);
      expect(tauriInvokeMock).toHaveBeenCalledWith('parse_ansi_lines', {
        lines: ['INFO', 'WARN'],
      });
      expect(result).toEqual(parsed);
    });
  });
});
