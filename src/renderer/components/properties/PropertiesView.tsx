import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from '../../../i18n';
import { logError } from '../../../lib/error-utils';
import {
  getServerProperties,
  saveServerProperties,
  type PropertyValue,
} from '../../../lib/properties-commands';
import { serverPropertiesList } from '../../shared/propertiesData';
import type { MinecraftServer } from '../../shared/server declaration';
import { Button } from '../ui/Button';
import { Input, NativeSelect } from '../ui/Field';
import { Switch } from '../ui/Switch';
import AdvancedSettingsWindow from './AdvancedSettingsWindow';

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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (type === 'success') toast.success(msg);
    else if (type === 'error') toast.error(msg);
    else toast(msg);
  };

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
        showToast(t('properties.loadFailed'), 'error');
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
  }, [server.id, server.port, t]);

  const matchesSearch = useMemo(() => {
    if (!searchQuery.trim()) return (_key: string) => true;
    const q = searchQuery.toLowerCase();
    const defMap = new Map(serverPropertiesList.map((d) => [d.key, d]));
    return (key: string) => {
      const def = defMap.get(key);
      return (
        key.toLowerCase().includes(q) ||
        (def?.label ?? '').toLowerCase().includes(q) ||
        (def?.description ?? '').toLowerCase().includes(q)
      );
    };
  }, [searchQuery]);

  const handleChange = (key: string, value: PropertyValue) => {
    setProps((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
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
      showToast(t('properties.saveSuccess'), 'success');
    } catch (e) {
      if (!isCurrentServerView()) return;
      logError('Failed to save server properties', e, { serverId });
      showToast(t('properties.saveFailed'), 'error');
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
      showToast(t('properties.advancedSaveSuccess'), 'success');
    } catch (e) {
      if (!isCurrentServerView()) return;
      logError('Failed to save advanced server properties', e, { serverId });
      showToast(t('properties.saveFailed'), 'error');
    }
  };

  if (loading) {
    return <div className="properties-view__loading">{t('properties.loading')}</div>;
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

  return (
    <div className="properties-view relative h-full overflow-y-auto" data-testid="properties-view">
      <div className="properties-view__container">
        <div className="properties-view__header">
          <h3>{t('properties.title')}</h3>
          <div className="properties-view__actions">
            <Button variant="secondary" onClick={openAdvancedWindow}>
              {t('properties.openAdvanced')}
            </Button>

            <Button variant="primary" onClick={handleSave} disabled={!hasChanges}>
              {t('properties.saveChanges')}
            </Button>
          </div>
        </div>

        <div className="properties-view__search-bar">
          <Input
            type="text"
            className="properties-view__search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('properties.search.placeholder')}
          />
        </div>

        <div className="properties-view__section">
          <div className="properties-view__section-title">{t('properties.sections.basic')}</div>

          {matchesSearch('motd') && (
            <div className="properties-view__row">
              <div className="properties-view__row-info">
                <span>{t('properties.motd.label')}</span>
                <span
                  className="properties-view__row-description"
                  title={t('properties.motd.description')}
                >
                  {t('properties.motd.description')}
                </span>
              </div>
              <Input
                type="text"
                className="properties-view__motd-input"
                value={props.motd as string}
                onChange={(e) => handleChange('motd', e.target.value)}
              />
            </div>
          )}

          {matchesSearch('gamemode') && (
            <div className="properties-view__row">
              <div className="properties-view__row-info">
                <span>{t('properties.gameMode.label')}</span>
              </div>
              <NativeSelect
                value={props.gamemode as string}
                onChange={(e) => handleChange('gamemode', e.target.value)}
              >
                <option value="survival">{t('properties.gameMode.options.survival')}</option>
                <option value="creative">{t('properties.gameMode.options.creative')}</option>
                <option value="adventure">{t('properties.gameMode.options.adventure')}</option>
                <option value="spectator">{t('properties.gameMode.options.spectator')}</option>
              </NativeSelect>
            </div>
          )}

          {matchesSearch('difficulty') && (
            <div className="properties-view__row">
              <div className="properties-view__row-info">
                <span>{t('properties.difficulty.label')}</span>
              </div>
              <NativeSelect
                value={props.difficulty as string}
                onChange={(e) => handleChange('difficulty', e.target.value)}
              >
                <option value="peaceful">{t('properties.difficulty.options.peaceful')}</option>
                <option value="easy">{t('properties.difficulty.options.easy')}</option>
                <option value="normal">{t('properties.difficulty.options.normal')}</option>
                <option value="hard">{t('properties.difficulty.options.hard')}</option>
              </NativeSelect>
            </div>
          )}
        </div>

        <div className="properties-view__section">
          <div className="properties-view__section-title">{t('properties.sections.gameplay')}</div>
          {matchesSearch('pvp') && (
            <ToggleItem
              label={t('properties.toggles.pvp.label')}
              desc={t('properties.toggles.pvp.description')}
              checked={Boolean(props.pvp)}
              onChange={(v) => handleChange('pvp', v)}
            />
          )}
          {matchesSearch('allow-flight') && (
            <ToggleItem
              label={t('properties.toggles.allowFlight.label')}
              desc={t('properties.toggles.allowFlight.description')}
              checked={Boolean(props['allow-flight'])}
              onChange={(v) => handleChange('allow-flight', v)}
            />
          )}
          {matchesSearch('enable-command-block') && (
            <ToggleItem
              label={t('properties.toggles.commandBlock.label')}
              desc={t('properties.toggles.commandBlock.description')}
              checked={Boolean(props['enable-command-block'])}
              onChange={(v) => handleChange('enable-command-block', v)}
            />
          )}
        </div>

        <div className="properties-view__section">
          <div className="properties-view__section-title">{t('properties.sections.network')}</div>

          {matchesSearch('max-players') && (
            <div className="properties-view__row">
              <div className="properties-view__row-info">
                <span>{t('properties.maxPlayers')}</span>
              </div>
              <Input
                type="number"
                className="properties-view__number-input properties-view__number-input--sm"
                value={props['max-players'] as number}
                onChange={(e) => handleChange('max-players', Number(e.target.value))}
              />
            </div>
          )}

          {matchesSearch('server-port') && (
            <div className="properties-view__row">
              <div className="properties-view__row-info">
                <span>{t('properties.serverPort')}</span>
              </div>
              <Input
                type="number"
                className="properties-view__number-input properties-view__number-input--md"
                value={props['server-port'] as number}
                onChange={(e) => handleChange('server-port', Number(e.target.value))}
              />
            </div>
          )}

          {matchesSearch('online-mode') && (
            <ToggleItem
              label={t('properties.toggles.onlineMode.label')}
              desc={t('properties.toggles.onlineMode.description')}
              checked={Boolean(props['online-mode'])}
              onChange={(v) => handleChange('online-mode', v)}
            />
          )}

          {matchesSearch('white-list') && (
            <ToggleItem
              label={t('properties.toggles.whitelist.label')}
              desc={t('properties.toggles.whitelist.description')}
              checked={Boolean(props['white-list'])}
              onChange={(v) => handleChange('white-list', v)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ToggleItem({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <div className="properties-view__row">
      <div className="properties-view__row-info">
        <span>{label}</span>
        <span className="properties-view__row-description" title={desc}>
          {desc}
        </span>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
