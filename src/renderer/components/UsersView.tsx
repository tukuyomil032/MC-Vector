import { Alert } from '@/components/arc/alert/alert';
import { Button } from '@/components/arc/button/button';
import { Card } from '@/components/arc/card/card';
import { EmptyState } from '@/components/arc/empty-state/empty-state';
import { Input } from '@/components/arc/input/input';
import { Skeleton } from '@/components/arc/skeleton/skeleton';
import { Globe, User } from 'lucide-react';
import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../i18n';
import {
  getPlayerLists,
  mutatePlayerList,
  type PlayerEntry,
  type PlayerListType,
} from '../../lib/player-commands';
import { sendCommand } from '../../lib/server-commands';
import { notify } from '../shared/notify';
import type { MinecraftServer } from '../shared/server declaration';
import { useAppFeedback } from './AppFeedbackProvider';
import styles from './UsersView.module.css';

interface Props {
  server: MinecraftServer;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function UsersView({ server }: Props) {
  const { t } = useTranslation();
  const { confirm } = useAppFeedback();
  const [whitelist, setWhitelist] = useState<PlayerEntry[]>([]);
  const [ops, setOps] = useState<PlayerEntry[]>([]);
  const [bannedPlayers, setBannedPlayers] = useState<PlayerEntry[]>([]);
  const [bannedIps, setBannedIps] = useState<PlayerEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadRequestId = useRef(0);
  const currentServerId = useRef(server.id);

  const applyLists = useCallback((lists: Awaited<ReturnType<typeof getPlayerLists>>) => {
    setWhitelist(lists.whitelist);
    setOps(lists.ops);
    setBannedPlayers(lists.bannedPlayers);
    setBannedIps(lists.bannedIps);
    setLoaded(true);
    setLoadError(null);
  }, []);

  const loadAllLists = useCallback(async () => {
    const requestedServerId = server.id;
    const requestId = ++loadRequestId.current;
    try {
      const lists = await getPlayerLists(requestedServerId);
      if (requestId === loadRequestId.current && currentServerId.current === requestedServerId) {
        applyLists(lists);
      }
    } catch (error) {
      if (requestId === loadRequestId.current && currentServerId.current === requestedServerId) {
        setLoadError(errorText(error));
      }
    }
  }, [applyLists, server.id]);

  useEffect(() => {
    currentServerId.current = server.id;
    void loadAllLists();
    return () => {
      loadRequestId.current += 1;
    };
  }, [loadAllLists, server.id]);

  const retryLoad = () => {
    setLoadError(null);
    void loadAllLists();
  };

  const maybeApplyLiveCommand = async (
    type: PlayerListType,
    action: 'add' | 'remove',
    canonicalTarget: string,
  ) => {
    if (server.status !== 'online') {
      return;
    }
    const command = (() => {
      if (type === 'whitelist') {
        return `${action === 'add' ? 'whitelist add' : 'whitelist remove'} ${canonicalTarget}`;
      }
      if (type === 'ops') {
        return `${action === 'add' ? 'op' : 'deop'} ${canonicalTarget}`;
      }
      if (type === 'banned-players') {
        return `${action === 'add' ? 'ban' : 'pardon'} ${canonicalTarget}`;
      }
      return `${action === 'add' ? 'ban-ip' : 'pardon-ip'} ${canonicalTarget}`;
    })();
    await sendCommand(server.id, command);
    setTimeout(() => {
      void loadAllLists();
    }, 500);
  };

  const handleAdd = async (type: PlayerListType, value: string): Promise<boolean> => {
    if (!value.trim()) {
      return false;
    }
    try {
      const result = await mutatePlayerList(server.id, type, 'add', value.trim());
      if (currentServerId.current === server.id) {
        applyLists(result.lists);
      }
      if (!result.changed) {
        notify.info(t('users.toast.alreadyExists'));
        return true;
      }
      try {
        await maybeApplyLiveCommand(type, 'add', result.canonicalTarget);
        notify.success(t('users.toast.listUpdated'));
      } catch (error) {
        notify.warning(t('users.toast.liveCommandFailed'), errorText(error));
      }
      return true;
    } catch (error) {
      notify.error(t('users.toast.addFailed'), errorText(error));
      return false;
    }
  };

  const handleRemove = async (type: PlayerListType, identifier: string): Promise<void> => {
    const confirmed = await confirm({
      title: t('users.removeTitle'),
      description: t('users.confirmRemove', { name: identifier }),
      confirmLabel: t('users.actions.remove'),
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }
    try {
      const result = await mutatePlayerList(server.id, type, 'remove', identifier);
      if (currentServerId.current === server.id) {
        applyLists(result.lists);
      }
      try {
        await maybeApplyLiveCommand(type, 'remove', result.canonicalTarget);
        notify.success(t('users.toast.removed'));
      } catch (error) {
        notify.warning(t('users.toast.liveCommandFailed'), errorText(error));
      }
    } catch (error) {
      notify.error(t('users.toast.removeFailed'), errorText(error));
    }
  };

  // Until the first load succeeds, a failed load shows its error instead of four empty lists.
  const showCards = loaded || loadError === null;

  return (
    <div className={styles.root} data-testid="users-view">
      {server.status !== 'online' && (
        <Alert tone="info" title={t('users.notOnline')}>
          {t('users.notOnlineHint')}
        </Alert>
      )}
      {loadError !== null && (
        <Alert tone="danger" title={t('users.loadFailed')}>
          <span className={styles.alertDetail}>{loadError}</span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className={styles.retry}
            onClick={retryLoad}
          >
            {t('users.retry')}
          </Button>
        </Alert>
      )}
      {showCards && (
        <div className={styles.grid}>
          <UserListCard
            type="whitelist"
            title={t('users.lists.whitelist')}
            entries={whitelist}
            loaded={loaded}
            emptyTitle={t('users.emptyList.whitelist.title')}
            emptyDescription={t('users.emptyList.whitelist.description')}
            onAdd={(val) => handleAdd('whitelist', val)}
            onRemove={(val) => handleRemove('whitelist', val)}
          />
          <UserListCard
            type="ops"
            title={t('users.lists.operators')}
            entries={ops}
            loaded={loaded}
            emptyTitle={t('users.emptyList.ops.title')}
            emptyDescription={t('users.emptyList.ops.description')}
            onAdd={(val) => handleAdd('ops', val)}
            onRemove={(val) => handleRemove('ops', val)}
          />
          <UserListCard
            type="banned-players"
            title={t('users.lists.bannedPlayers')}
            entries={bannedPlayers}
            loaded={loaded}
            emptyTitle={t('users.emptyList.bannedPlayers.title')}
            emptyDescription={t('users.emptyList.bannedPlayers.description')}
            onAdd={(val) => handleAdd('banned-players', val)}
            onRemove={(val) => handleRemove('banned-players', val)}
          />
          <UserListCard
            type="banned-ips"
            title={t('users.lists.bannedIps')}
            entries={bannedIps}
            loaded={loaded}
            emptyTitle={t('users.emptyList.bannedIps.title')}
            emptyDescription={t('users.emptyList.bannedIps.description')}
            onAdd={(val) => handleAdd('banned-ips', val)}
            onRemove={(val) => handleRemove('banned-ips', val)}
          />
        </div>
      )}
    </div>
  );
}

interface UserListCardProps {
  type: PlayerListType;
  title: string;
  entries: PlayerEntry[];
  loaded: boolean;
  emptyTitle: string;
  emptyDescription: string;
  onAdd: (value: string) => Promise<boolean>;
  onRemove: (identifier: string) => Promise<void>;
}

function UserListCard({
  type,
  title,
  entries,
  loaded,
  emptyTitle,
  emptyDescription,
  onAdd,
  onRemove,
}: UserListCardProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [pending, setPending] = useState(false);
  const [inputError, setInputError] = useState<string | undefined>();
  const inputRef = useRef<HTMLInputElement>(null);
  const isIpList = type === 'banned-ips';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) {
      return;
    }
    if (!value.trim()) {
      setInputError(
        t(isIpList ? 'users.validation.ipRequired' : 'users.validation.playerRequired'),
      );
      inputRef.current?.focus();
      return;
    }
    setInputError(undefined);
    setPending(true);
    try {
      if (await onAdd(value)) {
        setValue('');
      }
    } finally {
      setPending(false);
    }
  };

  let body: ReactNode;
  if (!loaded) {
    body = <Skeleton label={t('common.loading')} lines={3} />;
  } else if (entries.length === 0) {
    body = (
      <div className={styles.emptyWrap}>
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </div>
    );
  } else {
    body = (
      <ul className={styles.list}>
        {entries.map((entry) => (
          <UserRow
            key={`${type}:${entry.uuid ?? entry.ip ?? entry.name}`}
            type={type}
            entry={entry}
            onRemove={onRemove}
          />
        ))}
      </ul>
    );
  }

  return (
    <Card
      title={title}
      description={loaded ? t('users.count', { count: entries.length }) : undefined}
      className={styles.card}
      data-testid={`users-list-${type}`}
    >
      {body}
      <form className={styles.addForm} onSubmit={handleSubmit} noValidate>
        <Input
          ref={inputRef}
          label={isIpList ? t('users.placeholder.ipAddress') : t('users.placeholder.playerName')}
          data-testid={`users-input-${type}`}
          value={value}
          error={inputError}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setValue(event.target.value);
            setInputError(undefined);
          }}
        />
        <Button
          type="submit"
          variant="secondary"
          className={styles.addButton}
          data-testid={`users-add-${type}`}
          loading={pending}
        >
          {t('users.actions.add')}
        </Button>
      </form>
    </Card>
  );
}

interface UserRowProps {
  type: PlayerListType;
  entry: PlayerEntry;
  onRemove: (identifier: string) => Promise<void>;
}

function UserRow({ type, entry, onRemove }: UserRowProps) {
  const { t } = useTranslation();
  const isIpList = type === 'banned-ips';
  const identifier = isIpList ? (entry.ip ?? '') : entry.name;
  const details = [
    entry.reason,
    typeof entry.level === 'number' ? t('users.level', { level: entry.level }) : undefined,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className={styles.row}>
      <UserAvatar name={entry.name} isIpList={isIpList} />
      <div className={styles.rowText}>
        <span className={styles.rowName}>{isIpList ? entry.ip : entry.name}</span>
        {details && <span className={styles.rowMeta}>{details}</span>}
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={() => void onRemove(identifier)}>
        {t('users.actions.remove')}
      </Button>
    </li>
  );
}

function UserAvatar({ name, isIpList }: { name: string; isIpList: boolean }) {
  const [failed, setFailed] = useState(false);

  if (isIpList) {
    return (
      <span className={styles.avatar} aria-hidden="true">
        <Globe size={16} strokeWidth={1.75} />
      </span>
    );
  }
  if (failed || !name) {
    return (
      <span className={styles.avatar} aria-hidden="true">
        <User size={16} strokeWidth={1.75} />
      </span>
    );
  }
  return (
    <span className={styles.avatar} aria-hidden="true">
      <img
        className={styles.avatarImage}
        src={`https://minotar.net/avatar/${encodeURIComponent(name)}/32`}
        alt=""
        width={32}
        height={32}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
