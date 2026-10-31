import { Alert } from '@/components/arc/alert/alert';
import { Button } from '@/components/arc/button/button';
import { EmptyState } from '@/components/arc/empty-state/empty-state';
import { Input } from '@/components/arc/input/input';
import { NumberField } from '@/components/arc/number-field/number-field';
import { SearchField } from '@/components/arc/search-field/search-field';
import { Select } from '@/components/arc/select/select';
import { Switch } from '@/components/arc/switch/switch';
import { SearchX } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '../../../i18n';
import { logError } from '../../../lib/error-utils';
import {
  getServerProperties,
  saveServerProperties,
  type PropertyValue,
} from '../../../lib/properties-commands';
import { notify } from '../../shared/notify';
import { serverPropertiesList } from '../../shared/propertiesData';
import type { MinecraftServer } from '../../shared/server declaration';
import AdvancedSettingsWindow from './AdvancedSettingsWindow';
import styles from './PropertiesView.module.css';
import { useUnsavedChangesGuard } from './use-unsaved-changes-guard';

interface Props {
  server: MinecraftServer;
  onServerPortChanged?: (serverId: string, port: number) => void;
}

type ServerProperties = Record<string, PropertyValue>;

export default function PropertiesView({ server, onServerPortChanged }: Props) {
  const { t } = useTranslation();
  const currentServerIdRef = useRef(server.id);
  const serverViewGenerationRef = useRef(0);
  const propertiesLoadGenerationRef = useRef(0);
  const [props, setProps] = useState<ServerProperties>({
    'server-port': server.port || 25565,
    'max-players': 20,
    gamemode: 'survival',
    difficulty: 'easy',
    pvp: true,
    'online-mode': true,
    'enable-command-block': false,
    'allow-flight': false,
    'white-list': false,
    motd: 'A Minecraft Server',
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [loading, setLoading] = useState(true);
  // A failed read leaves the defaults above on screen. While this is set, the form is hidden and saving is blocked,
  // so the defaults can never overwrite the real server.properties file.
  const [loadError, setLoadError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  useUnsavedChangesGuard(hasChanges);
  useLayoutEffect(() => {
    currentServerIdRef.current = server.id;
    const generation = ++serverViewGenerationRef.current;
    return () => {
      if (serverViewGenerationRef.current === generation) {
        serverViewGenerationRef.current += 1;
      }
      if (currentServerIdRef.current === server.id) {
        currentServerIdRef.current = '';
      }
    };
  }, [server.id]);

  useEffect(() => {
    const serverId = server.id;
    const generation = ++propertiesLoadGenerationRef.current;
    const isCurrentLoad = () => propertiesLoadGenerationRef.current === generation;
    const loadProperties = async () => {
      setLoading(true);
      setLoadError(false);
      try {
        const newProps = await getServerProperties(serverId);
        if (!isCurrentLoad()) return;

        setProps((prev) => ({
          ...prev,
          ...newProps,
          'server-port': newProps['server-port'] ?? prev['server-port'],
        }));
        setHasChanges(false);
      } catch (e) {
        if (!isCurrentLoad()) return;
        logError('Failed to load server properties', e, { serverId });
        setLoadError(true);
        setHasChanges(false);
      } finally {
        if (isCurrentLoad()) {
          setLoading(false);
        }
      }
    };

    void loadProperties();
    return () => {
      if (propertiesLoadGenerationRef.current === generation) {
        propertiesLoadGenerationRef.current += 1;
      }
    };
  }, [server.id, reloadToken, t]);

  const definitions = useMemo(() => new Map(serverPropertiesList.map((d) => [d.key, d])), []);

  const matchesSearch = useMemo(() => {
    if (!searchQuery.trim()) return (_key: string) => true;
    const q = searchQuery.toLowerCase();
    return (key: string) => {
      const def = definitions.get(key);
      return (
        key.toLowerCase().includes(q) ||
        (def?.label ?? '').toLowerCase().includes(q) ||
        (def?.description ?? '').toLowerCase().includes(q)
      );
    };
  }, [searchQuery, definitions]);

  const handleChange = (key: string, value: PropertyValue) => {
    setProps((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    // Defaults shown after a failed read must never be written back to the file.
    if (loadError) return;
    const serverId = server.id;
    const viewGeneration = serverViewGenerationRef.current;
    const isCurrentServerView = () =>
      currentServerIdRef.current === serverId && serverViewGenerationRef.current === viewGeneration;
    try {
      const savedPort = await saveServerProperties(serverId, props);
      if (savedPort !== null) {
        onServerPortChanged?.(serverId, savedPort);
      }
      if (!isCurrentServerView()) return;
      setHasChanges(false);
      notify.success(t('properties.saveSuccess'));
    } catch (e) {
      if (!isCurrentServerView()) return;
      logError('Failed to save server properties', e, { serverId });
      notify.error(t('properties.saveFailed'));
    }
  };

  const openAdvancedWindow = () => {
    setShowAdvanced(true);
  };

  const handleAdvancedSave = async (data: Record<string, unknown>) => {
    const serverId = server.id;
    const viewGeneration = serverViewGenerationRef.current;
    const isCurrentServerView = () =>
      currentServerIdRef.current === serverId && serverViewGenerationRef.current === viewGeneration;
    try {
      const safeData: ServerProperties = {};
      Object.entries(data).forEach(([key, value]) => {
        safeData[key] =
          typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string'
            ? value
            : String(value);
      });
      const savedPort = await saveServerProperties(serverId, safeData);
      if (savedPort !== null) {
        onServerPortChanged?.(serverId, savedPort);
      }
      if (!isCurrentServerView()) return;
      // Sync local props state with advanced changes
      setProps((prev) => ({ ...prev, ...safeData }));
      setShowAdvanced(false);
      setHasChanges(false);
      notify.success(t('properties.advancedSaveSuccess'));
    } catch (e) {
      if (!isCurrentServerView()) return;
      logError('Failed to save advanced server properties', e, { serverId });
      notify.error(t('properties.saveFailed'));
    }
  };

  if (loading) {
    return (
      <div className={styles.loading} role="status" data-testid="properties-loading">
        {t('properties.loading')}
      </div>
    );
  }

  if (showAdvanced) {
    return (
      <AdvancedSettingsWindow
        initialData={props as Record<string, unknown>}
        onSave={handleAdvancedSave}
        onCancel={() => setShowAdvanced(false)}
      />
    );
  }

  const basicVisible = ['motd', 'gamemode', 'difficulty'].some(matchesSearch);
  const gameplayVisible = ['pvp', 'allow-flight', 'enable-command-block'].some(matchesSearch);
  const networkVisible = ['max-players', 'server-port', 'online-mode', 'white-list'].some(
    matchesSearch,
  );
  const anyVisible = basicVisible || gameplayVisible || networkVisible;

  const header = (
    <header className={styles.header}>
      <h2 className={styles.title}>{t('properties.title')}</h2>
      <div className={styles.actions}>
        {hasChanges && (
          <span className={styles.unsaved} role="status">
            {t('properties.unsavedChanges')}
          </span>
        )}
        <Button variant="secondary" onClick={openAdvancedWindow} disabled={loadError}>
          {t('properties.openAdvanced')}
        </Button>
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={!hasChanges || loadError}
          data-testid="properties-save-button"
        >
          {t('properties.saveChanges')}
        </Button>
      </div>
    </header>
  );

  if (loadError) {
    return (
      <div className={styles.page} data-testid="properties-view">
        {header}
        <Alert tone="danger" open title={t('properties.loadFailed')}>
          <p>{t('properties.loadFailedDescription')}</p>
        </Alert>
        <div>
          <Button
            variant="secondary"
            onClick={() => setReloadToken((value) => value + 1)}
            data-testid="properties-retry-button"
          >
            {t('properties.retry')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page} data-testid="properties-view">
      {header}

      <div className={styles.toolbar}>
        <SearchField
          label={t('properties.search.label')}
          placeholder={t('properties.search.placeholder')}
          value={searchQuery}
          onValueChange={setSearchQuery}
        />
      </div>

      {!anyVisible && (
        <EmptyState
          className={styles.empty}
          icon={<SearchX size={20} strokeWidth={1.75} aria-hidden={true} />}
          title={t('properties.search.emptyTitle')}
          description={t('properties.search.empty')}
        />
      )}

      {basicVisible && (
        <section className={styles.card} aria-labelledby="properties-basic-title">
          <h3 id="properties-basic-title" className={styles.cardTitle}>
            {t('properties.sections.basic')}
          </h3>
          <div className={styles.grid}>
            {matchesSearch('motd') && (
              <div className={styles.wide}>
                <Input
                  label={t('properties.motd.label')}
                  description={t('properties.motd.description')}
                  type="text"
                  value={props.motd as string}
                  onChange={(e) => handleChange('motd', e.target.value)}
                />
              </div>
            )}
            {matchesSearch('gamemode') && (
              <Select
                label={t('properties.gameMode.label')}
                value={props.gamemode as string}
                onValueChange={(value) => handleChange('gamemode', value)}
                options={[
                  { value: 'survival', label: t('properties.gameMode.options.survival') },
                  { value: 'creative', label: t('properties.gameMode.options.creative') },
                  { value: 'adventure', label: t('properties.gameMode.options.adventure') },
                  { value: 'spectator', label: t('properties.gameMode.options.spectator') },
                ]}
              />
            )}
            {matchesSearch('difficulty') && (
              <Select
                label={t('properties.difficulty.label')}
                value={props.difficulty as string}
                onValueChange={(value) => handleChange('difficulty', value)}
                options={[
                  { value: 'peaceful', label: t('properties.difficulty.options.peaceful') },
                  { value: 'easy', label: t('properties.difficulty.options.easy') },
                  { value: 'normal', label: t('properties.difficulty.options.normal') },
                  { value: 'hard', label: t('properties.difficulty.options.hard') },
                ]}
              />
            )}
          </div>
        </section>
      )}

      {gameplayVisible && (
        <section className={styles.card} aria-labelledby="properties-gameplay-title">
          <h3 id="properties-gameplay-title" className={styles.cardTitle}>
            {t('properties.sections.gameplay')}
          </h3>
          {matchesSearch('pvp') && (
            <ToggleRow
              id="pvp"
              label={t('properties.toggles.pvp.label')}
              description={t('properties.toggles.pvp.description')}
              checked={Boolean(props.pvp)}
              onChange={(v) => handleChange('pvp', v)}
            />
          )}
          {matchesSearch('allow-flight') && (
            <ToggleRow
              id="allow-flight"
              label={t('properties.toggles.allowFlight.label')}
              description={t('properties.toggles.allowFlight.description')}
              checked={Boolean(props['allow-flight'])}
              onChange={(v) => handleChange('allow-flight', v)}
            />
          )}
          {matchesSearch('enable-command-block') && (
            <ToggleRow
              id="enable-command-block"
              label={t('properties.toggles.commandBlock.label')}
              description={t('properties.toggles.commandBlock.description')}
              checked={Boolean(props['enable-command-block'])}
              onChange={(v) => handleChange('enable-command-block', v)}
            />
          )}
        </section>
      )}

      {networkVisible && (
        <section className={styles.card} aria-labelledby="properties-network-title">
          <h3 id="properties-network-title" className={styles.cardTitle}>
            {t('properties.sections.network')}
          </h3>
          <div className={styles.grid}>
            {matchesSearch('max-players') && (
              <NumberField
                label={t('properties.maxPlayers')}
                min={0}
                value={props['max-players'] as number}
                onValueChange={(value) => handleChange('max-players', value)}
              />
            )}
            {matchesSearch('server-port') && (
              <NumberField
                label={t('properties.serverPort')}
                min={1}
                max={65535}
                formatOptions={{ useGrouping: false }}
                value={props['server-port'] as number}
                onValueChange={(value) => handleChange('server-port', value)}
              />
            )}
          </div>
          {matchesSearch('online-mode') && (
            <ToggleRow
              id="online-mode"
              label={t('properties.toggles.onlineMode.label')}
              description={t('properties.toggles.onlineMode.description')}
              checked={Boolean(props['online-mode'])}
              onChange={(v) => handleChange('online-mode', v)}
            />
          )}
          {matchesSearch('white-list') && (
            <ToggleRow
              id="white-list"
              label={t('properties.toggles.whitelist.label')}
              description={t('properties.toggles.whitelist.description')}
              checked={Boolean(props['white-list'])}
              onChange={(v) => handleChange('white-list', v)}
            />
          )}
        </section>
      )}
    </div>
  );
}

function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <div className={styles.toggleRow}>
      <div className={styles.toggleText}>
        <span className={styles.toggleLabel} id={`properties-${id}-label`}>
          {label}
        </span>
        <span className={styles.toggleDescription} id={`properties-${id}-description`}>
          {description}
        </span>
      </div>
      <Switch
        aria-labelledby={`properties-${id}-label`}
        aria-describedby={`properties-${id}-description`}
        checked={checked}
        onCheckedChange={onChange}
        data-testid={`properties-toggle-${id}`}
      />
    </div>
  );
}
