import { tauriInvoke } from './tauri-api';

export interface AnsiSegment {
  text: string;
  color: string | null;
  backgroundColor: string | null;
  fontWeight: number | null;
}

export async function parseAnsiLines(lines: string[]): Promise<AnsiSegment[][]> {
  return tauriInvoke<AnsiSegment[][]>('parse_ansi_lines', { lines });
}
