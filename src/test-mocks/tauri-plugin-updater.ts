export interface Update {
  version: string;
  date?: string;
  body?: string | null;
  currentVersion: string;
  rawInfo: Record<string, unknown>;
  downloadAndInstall: (
    onEvent?: (progress: { event: string; data?: unknown }) => void,
  ) => Promise<void>;
}

export async function check(_options?: unknown): Promise<Update | null> {
  return null;
}
