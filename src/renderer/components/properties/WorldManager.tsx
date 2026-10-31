import { HoldToConfirm } from '@/components/arc/hold-to-confirm/hold-to-confirm';
import { Globe } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from '../../../i18n';
import { logError } from '../../../lib/error-utils';
import { deleteItem, listFiles } from '../../../lib/file-commands';
import { formatFolderSize, measureFolder, type FolderSize } from '../../shared/folder-size';
import { notify } from '../../shared/notify';
import type { MinecraftServer } from '../../shared/server declaration';
import { EmptyLine } from '../ui/EmptyLine';
import { SectionTitle } from '../ui/IconTile';
import { Tooltip } from '../ui/Tooltip';
import styles from './WorldManager.module.css';

interface Props {
  server: MinecraftServer;
}

/** Lists the server's world folders with their sizes, and deletes one after a hold. Deleting needs the server to be offline. */
export function WorldManager({ server }: Props) {
  const { t, locale } = useTranslation();
  const headingId = useId();
  const [worlds, setWorlds] = useState<string[]>([]);
  const [worldSizes, setWorldSizes] = useState<Record<string, FolderSize>>({});
  const [deleting, setDeleting] = useState(false);
  // Each listing, measurement, and delete takes a new request id. The effect cleanup takes one too, so work started
  // for an earlier server or instance is dropped even when the same server id comes back (A to B to A).
  const requestIdRef = useRef(0);
  // The load can report a failure from a stable callback, so it reads the latest translator through this ref.
  const translateRef = useRef(t);
  const deletable = server.status === 'offline';

  useLayoutEffect(() => {
    translateRef.current = t;
  }, [t]);

  const loadWorlds = useCallback(async (serverPath: string) => {
    const requestId = ++requestIdRef.current;
    const isCurrent = () => requestIdRef.current === requestId;
    try {
      const entries = await listFiles(serverPath);
      if (!isCurrent()) return;
      const candidates = entries.filter(
        (entry) => entry.isDirectory && entry.name.toLowerCase() !== 'backups',
      );

      const worldNames: string[] = [];
      await Promise.all(
        candidates.map(async (candidate) => {
          if (!isCurrent()) return;
          try {
            const children = await listFiles(`${serverPath}/${candidate.name}`);
            if (!isCurrent()) return;
            const hasLevelDat = children.some(
              (child) => !child.isDirectory && child.name === 'level.dat',
            );
            if (hasLevelDat || /^world($|[_-])/i.test(candidate.name)) {
              worldNames.push(candidate.name);
            }
          } catch (error) {
            if (!isCurrent()) return;
            logError('Failed to inspect world directory candidate', error, {
              serverPath,
              candidate: candidate.name,
            });
          }
        }),
      );

      if (!isCurrent()) return;
      const unique = Array.from(new Set(worldNames)).sort((a, b) => a.localeCompare(b));
      setWorlds(unique);
      // Sizes fill in after the list is shown. Each one is dropped if a newer listing has started since.
      setWorldSizes(
        Object.fromEntries(
          unique.map((name): [string, FolderSize] => [name, { status: 'loading' }]),
        ),
      );
      for (const name of unique) {
        void measureFolder(`${serverPath}/${name}`).then((size) => {
          if (!isCurrent()) return;
          setWorldSizes((current) => (name in current ? { ...current, [name]: size } : current));
        });
      }
    } catch (error) {
      if (!isCurrent()) return;
      logError('Failed to load world candidates', error, { serverPath });
      setWorlds([]);
      notify.error(translateRef.current('backups.toast.worldLoadFailed'));
    }
  }, []);

  useEffect(() => {
    setWorlds([]);
    setWorldSizes({});
    setDeleting(false);
    void loadWorlds(server.path);
    return () => {
      requestIdRef.current += 1;
    };
  }, [loadWorlds, server.id, server.path]);

  const handleDeleteWorld = async (worldName: string) => {
    const requestId = ++requestIdRef.current;
    const isCurrent = () => requestIdRef.current === requestId;
    const serverPath = server.path;
    setDeleting(true);
    try {
      await deleteItem(`${serverPath}/${worldName}`);
    } catch (error) {
      if (isCurrent()) {
        logError('Failed to delete world data', error, { serverPath, worldName });
        notify.error(t('backups.world.deleteFailed'));
        setDeleting(false);
      }
      return;
    }
    if (!isCurrent()) return;
    notify.success(t('backups.world.deleted', { name: worldName }));
    setDeleting(false);
    await loadWorlds(serverPath);
  };

  return (
    <section className={styles.root} aria-labelledby={headingId}>
      <SectionTitle icon={Globe} as="h3" id={headingId} title={t('backups.world.title')} />
      <p className={styles.helpText}>{t('backups.world.detected')}</p>

      {worlds.length === 0 ? (
        <EmptyLine title={t('backups.world.empty')} />
      ) : (
        <ul className={styles.worldList}>
          {worlds.map((worldName) => (
            <li key={worldName} className={styles.worldRow}>
              <span className={styles.worldIcon} aria-hidden="true">
                <Globe size={14} />
              </span>
              <span className={styles.worldName}>{worldName}</span>
              <span className={styles.worldSize} data-testid={`world-size-${worldName}`}>
                {formatFolderSize(worldSizes[worldName] ?? { status: 'loading' }, locale, t)}
              </span>
              {/* One hold is the confirmation. The row is removed on success, and confirmed={false} resets the hold after a failed delete. */}
              <Tooltip content={t('backups.world.stopServerFirst')} disabled={deletable}>
                <span className={styles.holdSlot} data-blocked={deletable ? undefined : true}>
                  <HoldToConfirm
                    label={t('backups.world.holdToDelete')}
                    confirmedLabel={t('backups.world.holdDone')}
                    tone="danger"
                    confirmed={false}
                    disabled={!deletable || deleting}
                    onConfirm={() => void handleDeleteWorld(worldName)}
                  />
                </span>
              </Tooltip>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default WorldManager;
