import type { Translate } from '../../i18n';
import { getManagedDirectorySize } from '../../lib/file-commands';
import { logError } from '../../lib/error-utils';
import { formatBytes } from './format-bytes';

/** A folder size as the UI shows it. `failed` means the measurement itself did not succeed. */
export type FolderSize =
  | { status: 'loading' }
  | { status: 'ready'; bytes: number; complete: boolean }
  | { status: 'failed' };

/** Measures a server or world folder. A failed walk comes back as `failed`, so one folder cannot break the view. */
export async function measureFolder(path: string): Promise<FolderSize> {
  try {
    const result = await getManagedDirectorySize(path);
    return { status: 'ready', bytes: result.bytes, complete: result.complete };
  } catch (error) {
    logError('Failed to measure folder size', error, { path });
    return { status: 'failed' };
  }
}

/** The size text for a folder row. A scan that ran out of time shows as a lower bound. */
export function formatFolderSize(size: FolderSize | null, locale: string, t: Translate): string {
  if (!size || size.status === 'loading') return '…';
  if (size.status === 'failed') return '—';
  const formatted = formatBytes(size.bytes, locale);
  return size.complete ? formatted : t('backups.size.atLeast', { size: formatted });
}
