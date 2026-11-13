import { getE2eRuntime } from '../e2e/support/e2e-runtime';

export interface Update {
  version: string;
  date?: string;
  body?: string | null;
  currentVersion: string;
  rawInfo: Record<string, unknown>;
  downloadAndInstall: (
    onEvent?: (progress: { event: string; data?: unknown }) => void,
  ) => Promise<void>;
  download: (onEvent?: (progress: { event: string; data?: unknown }) => void) => Promise<void>;
  install: () => Promise<void>;
  close: () => Promise<void>;
}

const TOTAL_BYTES = 1000;
const FIRST_CHUNK_BYTES = 420;

/**
 * Without an opt-in updater option, no update is ever found (the E2E default).
 * The UI reference captures set state.updater to reach the available, downloading, error, and ready phases.
 */
export async function check(_options?: unknown): Promise<Update | null> {
  const option = getE2eRuntime()?.state.updater;
  if (!option) return null;
  if (option.checkDelayMs) await new Promise((resolve) => setTimeout(resolve, option.checkDelayMs));
  if (option.checkError !== undefined) throw new Error(option.checkError);
  if (option.version === undefined) return null;

  const version = option.version;
  const update: Update = {
    version,
    date: '2026-11-01T00:00:00.000Z',
    body: option.body ?? null,
    currentVersion: '0.0.0-playwright',
    rawInfo: {},
    download: async (onEvent) => {
      onEvent?.({ event: 'Started', data: { contentLength: TOTAL_BYTES } });
      onEvent?.({ event: 'Progress', data: { chunkLength: FIRST_CHUNK_BYTES } });
      if (option.download === 'fail') {
        throw new Error(option.downloadError ?? 'E2E download failed');
      }
      if (option.download !== 'finish') {
        // 'hold' (the default when set without a mode) keeps the download pending for the capture.
        await new Promise<void>(() => {});
      }
      onEvent?.({ event: 'Finished', data: undefined });
    },
    install: async () => {},
    close: async () => {},
    downloadAndInstall: async (onEvent) => {
      await update.download(onEvent);
      await update.install();
    },
  };
  return update;
}
