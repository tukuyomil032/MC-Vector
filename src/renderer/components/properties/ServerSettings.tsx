import { appDataDir } from '@tauri-apps/api/path';
import React, { useEffect, useRef, useState } from 'react';
import { copyToClipboard } from '../../../lib/clipboard-commands';
import { useTranslation } from '../../../i18n';
import { getJavaVersions, type JavaVersion } from '../../../lib/java-commands';
import {
  clearNgrokToken,
  getNgrokToken,
  hasNgrokToken,
  onNgrokStatusChange,
  setNgrokToken,
  startNgrok,
  stopNgrok,
} from '../../../lib/ngrok-commands';
import { type MinecraftServer } from '../../components/../shared/server declaration';
import { VERSION_OPTIONS } from '../../constants/versionOptions';
import { JVM_PRESETS } from '../../shared/jvm-presets';
import JavaManagerModal from '../JavaManagerModal';
import VersionUpgradeWizard from '../VersionUpgradeWizard';
import { useToast } from '../ToastProvider';
import { Select } from '../ui/Select';

interface ServerSettingsProps {
  server: MinecraftServer;
  onSave: (updatedServer: MinecraftServer) => Promise<void>;
  onOpenNgrokGuide: () => void;
}

const ServerSettings: React.FC<ServerSettingsProps> = ({ server, onSave, onOpenNgrokGuide }) => {
  const { t } = useTranslation();

  const WEEKDAY_OPTIONS: Array<{ value: number; label: string }> = [
    { value: 0, label: t('serverSettings.weekdays.sunday') },
    { value: 1, label: t('serverSettings.weekdays.monday') },
    { value: 2, label: t('serverSettings.weekdays.tuesday') },
    { value: 3, label: t('serverSettings.weekdays.wednesday') },
    { value: 4, label: t('serverSettings.weekdays.thursday') },
    { value: 5, label: t('serverSettings.weekdays.friday') },
    { value: 6, label: t('serverSettings.weekdays.saturday') },
  ];

  const [name, setName] = useState(server.name);
  const [profileName, setProfileName] = useState(server.profileName || '');
  const [groupName, setGroupName] = useState(server.groupName || '');
  const [software, setSoftware] = useState(server.software || 'Paper');
  const [version, setVersion] = useState(server.version);
  const [memory, setMemory] = useState(server.memory);
  const [port, setPort] = useState(server.port);
  const [path, setPath] = useState(server.path);
  const [javaPath, setJavaPath] = useState(server.javaPath || '__system_default__');
  const [autoRestartOnCrash, setAutoRestartOnCrash] = useState(Boolean(server.autoRestartOnCrash));
  const [maxAutoRestarts, setMaxAutoRestarts] = useState(server.maxAutoRestarts ?? 3);
  const [autoRestartDelaySec, setAutoRestartDelaySec] = useState(server.autoRestartDelaySec ?? 5);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(Boolean(server.autoBackupEnabled));
  const [autoBackupIntervalMin, setAutoBackupIntervalMin] = useState(
    server.autoBackupIntervalMin ?? 60,
  );
  const [autoBackupScheduleType, setAutoBackupScheduleType] = useState<
    'interval' | 'daily' | 'weekly'
  >(server.autoBackupScheduleType ?? 'interval');
  const [autoBackupTime, setAutoBackupTime] = useState(server.autoBackupTime ?? '03:00');
  const [autoBackupWeekday, setAutoBackupWeekday] = useState(server.autoBackupWeekday ?? 0);
  const [autoBackupRetainCount, setAutoBackupRetainCount] = useState(
    server.autoBackupRetainCount ?? 0,
  );
  const [autoBackupRetainDays, setAutoBackupRetainDays] = useState(
    server.autoBackupRetainDays ?? 0,
  );
  const [jvmArgs, setJvmArgs] = useState(server.jvmArgs ?? '');
  const [notifyOnCrash, setNotifyOnCrash] = useState(server.notifyOnCrash !== false);
  const [notifyOnStart, setNotifyOnStart] = useState(Boolean(server.notifyOnStart));
  const [notifyOnHighCpu, setNotifyOnHighCpu] = useState(Boolean(server.notifyOnHighCpu));
  const [notifyHighCpuThreshold, setNotifyHighCpuThreshold] = useState(
    server.notifyHighCpuThreshold ?? 90,
  );
  const [isSaving, setIsSaving] = useState(false);

  const [showJavaManager, setShowJavaManager] = useState(false);
  const [showVersionWizard, setShowVersionWizard] = useState(false);
  const [installedJava, setInstalledJava] = useState<JavaVersion[]>([]);

  const [isTunneling, setIsTunneling] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [tunnelLog, setTunnelLog] = useState<string[]>([]);

  const [showTokenModal, setShowTokenModal] = useState(false);
  const [inputToken, setInputToken] = useState('');

  const { showToast } = useToast();

  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setName(server.name);
    setProfileName(server.profileName || '');
    setGroupName(server.groupName || '');
    setVersion(server.version);
    setMemory(server.memory);
    setPort(server.port);
    setPath(server.path);
    if (server.software) {
      setSoftware(server.software);
    }
    if (server.javaPath) {
      setJavaPath(server.javaPath);
    } else {
      setJavaPath('__system_default__');
    }
    setAutoRestartOnCrash(Boolean(server.autoRestartOnCrash));
    setMaxAutoRestarts(server.maxAutoRestarts ?? 3);
    setAutoRestartDelaySec(server.autoRestartDelaySec ?? 5);
    setAutoBackupEnabled(Boolean(server.autoBackupEnabled));
    setAutoBackupIntervalMin(server.autoBackupIntervalMin ?? 60);
    setAutoBackupScheduleType(server.autoBackupScheduleType ?? 'interval');
    setAutoBackupTime(server.autoBackupTime ?? '03:00');
    setAutoBackupWeekday(server.autoBackupWeekday ?? 0);
    setAutoBackupRetainCount(server.autoBackupRetainCount ?? 0);
    setAutoBackupRetainDays(server.autoBackupRetainDays ?? 0);
    setJvmArgs(server.jvmArgs ?? '');
    setNotifyOnCrash(server.notifyOnCrash !== false);
    setNotifyOnStart(Boolean(server.notifyOnStart));
    setNotifyOnHighCpu(Boolean(server.notifyOnHighCpu));
    setNotifyHighCpuThreshold(server.notifyHighCpuThreshold ?? 90);

    loadJavaList();

    checkNgrokStatus();
  }, [server]);

  const checkNgrokStatus = async () => {
    // Ngrok status is now event-driven via onNgrokStatusChange
  };

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void onNgrokStatusChange((data) => {
      if (data.serverId === server.id) {
        if (data.status === 'connecting' || data.status === 'connected') {
          setIsTunneling(true);
        }
        if (data.status === 'stopped' || data.status === 'error') {
          setIsTunneling(false);
          setTunnelUrl(null);
        }
        if (data.url) {
          setTunnelUrl(data.url);
        }
      }
    }).then((u) => {
      if (cancelled) {
        u();
        return;
      }
      unlisten = u;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [server.id]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [tunnelLog]);

  const loadJavaList = async () => {
    const list = await getJavaVersions();
    setInstalledJava(list);
  };

  const handleSubmit = async () => {
    if (isSaving) {
      return;
    }

    const normalizedRestartLimit = Math.min(20, Math.max(0, Math.floor(maxAutoRestarts || 0)));
    const normalizedRestartDelay = Math.min(300, Math.max(1, Math.floor(autoRestartDelaySec || 1)));
    const normalizedBackupInterval = Math.min(
      1440,
      Math.max(1, Math.floor(autoBackupIntervalMin || 1)),
    );
    const normalizedScheduleType: 'interval' | 'daily' | 'weekly' =
      autoBackupScheduleType === 'daily' || autoBackupScheduleType === 'weekly'
        ? autoBackupScheduleType
        : 'interval';
    const normalizedBackupTime = /^([01]\d|2[0-3]):([0-5]\d)$/.test(autoBackupTime.trim())
      ? autoBackupTime.trim()
      : '03:00';
    const normalizedBackupWeekday = Math.min(6, Math.max(0, Math.floor(autoBackupWeekday || 0)));

    setIsSaving(true);
    try {
      await onSave({
        ...server,
        name,
        profileName: profileName.trim() || undefined,
        groupName: groupName.trim() || undefined,
        version,
        memory,
        port,
        path,
        software,
        javaPath: javaPath === '__system_default__' ? undefined : javaPath,
        autoRestartOnCrash,
        maxAutoRestarts: normalizedRestartLimit,
        autoRestartDelaySec: normalizedRestartDelay,
        autoBackupEnabled,
        autoBackupIntervalMin: normalizedBackupInterval,
        autoBackupScheduleType: normalizedScheduleType,
        autoBackupTime: normalizedBackupTime,
        autoBackupWeekday: normalizedBackupWeekday,
        autoBackupRetainCount,
        autoBackupRetainDays,
        jvmArgs: jvmArgs.trim() || undefined,
        notifyOnCrash,
        notifyOnStart,
        notifyOnHighCpu,
        notifyHighCpuThreshold,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleTunnel = async () => {
    const nextState = !isTunneling;

    if (nextState) {
      const hasToken = await hasNgrokToken();
      if (!hasToken && !inputToken) {
        setShowTokenModal(true);
        return;
      }
      const tokenToUse = inputToken || (await getNgrokToken()) || '';
      if (!tokenToUse) {
        setShowTokenModal(true);
        return;
      }
      setTunnelLog((prev) => [...prev, t('serverSettings.ngrok.initializing')]);
      const ngrokPath = `${await appDataDir()}/ngrok`;
      await startNgrok(ngrokPath, 'tcp', server.port, tokenToUse, server.id);
      setInputToken('');
    } else {
      await stopNgrok();
    }
  };

  const handleResetToken = async () => {
    await clearNgrokToken();
    setInputToken('');
    setShowTokenModal(true);
  };

  const handleTokenSubmit = async () => {
    if (!inputToken) {
      return;
    }
    await setNgrokToken(inputToken);
    setShowTokenModal(false);
    setTunnelLog([t('serverSettings.ngrok.initializingWithNewToken')]);
    const ngrokPath = `${await appDataDir()}/ngrok`;
    await startNgrok(ngrokPath, 'tcp', server.port, inputToken, server.id);
    setInputToken('');
  };

  const handleCopyUrl = () => {
    if (tunnelUrl) {
      void copyToClipboard(tunnelUrl);
      showToast(t('serverSettings.ngrok.addressCopied'), 'success');
    }
  };

  const handleOpenGuide = async () => {
    onOpenNgrokGuide();
  };

  return (
    <div className="server-settings">
      <div className="server-settings__inner">
        <h2 className="server-settings__title">{t('serverSettings.title')}</h2>

        <div className="server-settings__panel">
          <h3 className="server-settings__panel-title">{t('serverSettings.basicConfig')}</h3>

          <div className="server-settings__field-block">
            <label className="server-settings__label">{t('serverSettings.serverName')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
            />
          </div>

          <div className="server-settings__row">
            <div className="server-settings__col">
              <label className="server-settings__label">{t('serverSettings.profileName')}</label>
              <input
                type="text"
                value={profileName}
                onChange={(event) => setProfileName(event.target.value)}
                placeholder={t('serverSettings.profileNamePlaceholder')}
                className="input-field"
              />
            </div>

            <div className="server-settings__col">
              <label className="server-settings__label">{t('serverSettings.groupName')}</label>
              <input
                type="text"
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                placeholder={t('serverSettings.groupNamePlaceholder')}
                className="input-field"
              />
            </div>
          </div>

          <div className="server-settings__row">
            <div className="server-settings__col">
              <label className="server-settings__label">{t('serverSettings.serverSoftware')}</label>
              <Select
                value={software}
                onValueChange={setSoftware}
                groups={[
                  {
                    label: t('serverSettings.softwareGroups.standard'),
                    options: [
                      { value: 'Vanilla', label: t('serverSettings.softwareOptions.vanilla') },
                      { value: 'Paper', label: t('serverSettings.softwareOptions.paper') },
                      { value: 'LeafMC', label: t('serverSettings.softwareOptions.leafmc') },
                      { value: 'Spigot', label: t('serverSettings.softwareOptions.spigot') },
                    ],
                  },
                  {
                    label: t('serverSettings.softwareGroups.modded'),
                    options: [
                      { value: 'Fabric', label: t('serverSettings.softwareOptions.fabric') },
                      { value: 'Forge', label: t('serverSettings.softwareOptions.forge') },
                    ],
                  },
                  {
                    label: t('serverSettings.softwareGroups.proxy'),
                    options: [
                      { value: 'Velocity', label: t('serverSettings.softwareOptions.velocity') },
                      { value: 'Waterfall', label: t('serverSettings.softwareOptions.waterfall') },
                      {
                        value: 'BungeeCord',
                        label: t('serverSettings.softwareOptions.bungeecord'),
                      },
                    ],
                  },
                ]}
              />
            </div>

            <div className="server-settings__col">
              <label className="server-settings__label">{t('serverSettings.version')}</label>
              <Select
                value={version}
                onValueChange={setVersion}
                options={VERSION_OPTIONS.map((v) => ({ value: v, label: v }))}
              />
            </div>

            <div className="server-settings__col server-settings__col--auto">
              <label className="server-settings__label">&nbsp;</label>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowVersionWizard(true)}
              >
                {t('serverSettings.versionUpgrade.buttonLabel')}
              </button>
            </div>
          </div>

          <div className="server-settings__field-block">
            <label className="server-settings__label">{t('serverSettings.javaRuntime')}</label>
            <div className="server-settings__java-row server-settings__java-row--runtime">
              <Select
                value={javaPath}
                onValueChange={setJavaPath}
                className="server-settings__java-runtime-select"
                options={[
                  { value: '__system_default__', label: t('serverSettings.javaSystemDefault') },
                  ...installedJava.map((j) => ({ value: j.path, label: `${j.name} (${j.path})` })),
                ]}
              />
              <button
                className="btn-secondary whitespace-nowrap server-settings__java-manage-btn"
                onClick={() => {
                  setShowJavaManager(true);
                  loadJavaList();
                }}
              >
                {t('serverSettings.manageJava')}
              </button>
            </div>
          </div>

          <div className="server-settings__row server-settings__row--spaced">
            <div className="server-settings__col">
              <label className="server-settings__label">{t('serverSettings.memory')}</label>
              <input
                type="number"
                value={memory}
                onChange={(e) => setMemory(Number(e.target.value))}
                className="input-field"
              />
            </div>
            <div className="server-settings__col">
              <label className="server-settings__label">{t('serverSettings.port')}</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                className="input-field"
              />
            </div>
          </div>

          <div className="server-settings__field-block">
            <label className="server-settings__label">{t('serverSettings.jvmArgs.label')}</label>
            <div className="server-settings__jvm-presets">
              {JVM_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="control-chip server-settings__jvm-preset-btn"
                  onClick={() => setJvmArgs(preset.args)}
                >
                  {t(preset.labelKey)}
                </button>
              ))}
              {jvmArgs && (
                <button
                  type="button"
                  className="control-chip server-settings__jvm-preset-btn"
                  onClick={() => setJvmArgs('')}
                >
                  {t('serverSettings.jvmArgs.clear')}
                </button>
              )}
            </div>
            <textarea
              className="input-field server-settings__jvm-textarea"
              value={jvmArgs}
              onChange={(e) => setJvmArgs(e.target.value)}
              placeholder={t('serverSettings.jvmArgs.placeholder')}
              rows={3}
            />
            <div className="server-settings__form-help">{t('serverSettings.jvmArgs.help')}</div>
          </div>

          <div className="server-settings__field-block">
            <label className="server-settings__label">{t('serverSettings.savePath')}</label>
            <div className="server-settings__java-row">
              <input
                type="text"
                value={path}
                readOnly
                className="input-field server-settings__path-input"
              />
            </div>
          </div>

          <div className="server-settings__field-block">
            <label className="server-settings__label">
              {t('serverSettings.autoRestart.title')}
            </label>
            <label className="server-settings__java-row">
              <input
                type="checkbox"
                checked={autoRestartOnCrash}
                onChange={(event) => setAutoRestartOnCrash(event.target.checked)}
              />
              <span>{t('serverSettings.autoRestart.enableDescription')}</span>
            </label>

            <div className="server-settings__row">
              <div className="server-settings__col">
                <label className="server-settings__label">
                  {t('serverSettings.autoRestart.maxRetries')}
                </label>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={maxAutoRestarts}
                  onChange={(event) => setMaxAutoRestarts(Number(event.target.value))}
                  className="input-field"
                />
              </div>

              <div className="server-settings__col">
                <label className="server-settings__label">
                  {t('serverSettings.autoRestart.delaySeconds')}
                </label>
                <input
                  type="number"
                  min={1}
                  max={300}
                  value={autoRestartDelaySec}
                  onChange={(event) => setAutoRestartDelaySec(Number(event.target.value))}
                  className="input-field"
                />
              </div>
            </div>
          </div>

          <div className="server-settings__field-block">
            <label className="server-settings__label">{t('serverSettings.autoBackup.title')}</label>
            <label className="server-settings__java-row">
              <input
                type="checkbox"
                checked={autoBackupEnabled}
                onChange={(event) => setAutoBackupEnabled(event.target.checked)}
              />
              <span>{t('serverSettings.autoBackup.enableDescription')}</span>
            </label>

            <div className="server-settings__row">
              <div className="server-settings__col">
                <label className="server-settings__label">
                  {t('serverSettings.autoBackup.scheduleType')}
                </label>
                <Select
                  value={autoBackupScheduleType}
                  onValueChange={(v) =>
                    setAutoBackupScheduleType(v as 'interval' | 'daily' | 'weekly')
                  }
                  options={[
                    {
                      value: 'interval',
                      label: t('serverSettings.autoBackup.scheduleOptions.interval'),
                    },
                    { value: 'daily', label: t('serverSettings.autoBackup.scheduleOptions.daily') },
                    {
                      value: 'weekly',
                      label: t('serverSettings.autoBackup.scheduleOptions.weekly'),
                    },
                  ]}
                />
              </div>

              {autoBackupScheduleType === 'interval' ? (
                <div className="server-settings__col">
                  <label className="server-settings__label">
                    {t('serverSettings.autoBackup.intervalMinutes')}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={autoBackupIntervalMin}
                    onChange={(event) => setAutoBackupIntervalMin(Number(event.target.value))}
                    className="input-field"
                  />
                </div>
              ) : (
                <div className="server-settings__col">
                  <label className="server-settings__label">
                    {t('serverSettings.autoBackup.executionTime')}
                  </label>
                  <input
                    type="time"
                    value={autoBackupTime}
                    onChange={(event) => setAutoBackupTime(event.target.value)}
                    className="input-field"
                  />
                </div>
              )}

              {autoBackupScheduleType === 'weekly' && (
                <div className="server-settings__col">
                  <label className="server-settings__label">
                    {t('serverSettings.autoBackup.weekday')}
                  </label>
                  <Select
                    value={String(autoBackupWeekday)}
                    onValueChange={(v) => setAutoBackupWeekday(Number(v))}
                    options={WEEKDAY_OPTIONS.map((w) => ({
                      value: String(w.value),
                      label: w.label,
                    }))}
                  />
                </div>
              )}

              <div className="server-settings__row">
                <div className="server-settings__col">
                  <label className="server-settings__label">
                    {t('serverSettings.autoBackup.retainCount')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={999}
                    value={autoBackupRetainCount}
                    onChange={(event) => setAutoBackupRetainCount(Number(event.target.value))}
                    className="input-field"
                  />
                </div>
                <div className="server-settings__col">
                  <label className="server-settings__label">
                    {t('serverSettings.autoBackup.retainDays')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={autoBackupRetainDays}
                    onChange={(event) => setAutoBackupRetainDays(Number(event.target.value))}
                    className="input-field"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="server-settings__section">
            <h3 className="server-settings__section-title">
              {t('serverSettings.notifications.title')}
            </h3>
            <div className="server-settings__row">
              <label className="server-settings__label">
                <input
                  type="checkbox"
                  checked={notifyOnCrash}
                  onChange={(e) => setNotifyOnCrash(e.target.checked)}
                  className="mr-2"
                />
                {t('serverSettings.notifications.onCrash')}
              </label>
            </div>
            <div className="server-settings__row">
              <label className="server-settings__label">
                <input
                  type="checkbox"
                  checked={notifyOnStart}
                  onChange={(e) => setNotifyOnStart(e.target.checked)}
                  className="mr-2"
                />
                {t('serverSettings.notifications.onStart')}
              </label>
            </div>
            <div className="server-settings__row">
              <label className="server-settings__label">
                <input
                  type="checkbox"
                  checked={notifyOnHighCpu}
                  onChange={(e) => setNotifyOnHighCpu(e.target.checked)}
                  className="mr-2"
                />
                {t('serverSettings.notifications.onHighCpu')}
              </label>
            </div>
            {notifyOnHighCpu && (
              <div className="server-settings__row">
                <label className="server-settings__label">
                  {t('serverSettings.notifications.cpuThreshold')}
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={notifyHighCpuThreshold}
                  onChange={(e) => setNotifyHighCpuThreshold(Number(e.target.value))}
                  className="input-field"
                />
              </div>
            )}
          </div>

          <div className="server-settings__actions">
            <button
              type="button"
              onClick={() => {
                void handleSubmit();
              }}
              className="btn-start server-settings__save-btn disabled:opacity-50"
              disabled={isSaving}
            >
              {t('serverSettings.saveSettings')}
            </button>
          </div>
        </div>

        <div className={`server-settings__ngrok-panel ${isTunneling ? 'is-active' : ''}`}>
          <div className="server-settings__ngrok-header">
            <div className="server-settings__ngrok-title-wrap">
              <h3 className="server-settings__ngrok-title">
                🌐 {t('serverSettings.ngrok.title')}
                {isTunneling && (
                  <span className="server-settings__online-badge">
                    {t('serverSettings.ngrok.onlineBadge')}
                  </span>
                )}
              </h3>
              <div className="server-settings__ngrok-description">
                {t('serverSettings.ngrok.description')}
              </div>
            </div>

            <div className="server-settings__ngrok-controls">
              <button
                className="btn-secondary server-settings__ngrok-btn server-settings__ngrok-btn--with-icon"
                onClick={handleOpenGuide}
                title={t('serverSettings.ngrok.connectionGuide')}
              >
                <span>❓</span> {t('serverSettings.ngrok.connectionGuide')}
              </button>

              <button
                className="btn-secondary server-settings__ngrok-btn"
                onClick={handleResetToken}
                title={t('serverSettings.ngrok.changeToken')}
              >
                {t('serverSettings.ngrok.changeToken')}
              </button>

              <label className="server-settings__ngrok-switch">
                <input
                  type="checkbox"
                  checked={isTunneling}
                  onChange={handleToggleTunnel}
                  className="server-settings__ngrok-switch-input"
                />
                <span
                  className={`server-settings__ngrok-switch-track ${isTunneling ? 'is-on' : 'is-off'}`}
                >
                  <span
                    className={`server-settings__ngrok-switch-thumb ${isTunneling ? 'is-on' : ''}`}
                  ></span>
                </span>
              </label>
            </div>
          </div>

          {(isTunneling || tunnelLog.length > 0) && (
            <div className="server-settings__ngrok-status">
              {tunnelUrl && (
                <div className="server-settings__address-card">
                  <div className="server-settings__address-label">
                    {t('serverSettings.ngrok.publicAddress')} (
                    {t('serverSettings.ngrok.shareWithFriends')}):
                  </div>
                  <div className="server-settings__address-row">
                    <code className="server-settings__address-code">
                      {tunnelUrl.replace('tcp://', '')}
                    </code>
                    <button
                      className="btn-secondary server-settings__copy-btn"
                      onClick={handleCopyUrl}
                    >
                      {t('common.copy')}
                    </button>
                  </div>
                </div>
              )}

              <div className="server-settings__log-panel">
                {tunnelLog.length === 0 && <div>{t('serverSettings.ngrok.ready')}</div>}
                {tunnelLog.map((line, i) => (
                  <div key={i} className="server-settings__log-line">
                    {line}
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>
          )}
        </div>
      </div>

      <JavaManagerModal
        open={showJavaManager}
        onClose={() => {
          setShowJavaManager(false);
          loadJavaList();
        }}
      />

      {showTokenModal && (
        <div className="server-settings__token-overlay modal-backdrop">
          <div className="server-settings__token-panel modal-panel">
            <h3 className="server-settings__token-title">
              {t('serverSettings.ngrok.tokenRequired.title')}
            </h3>
            <p className="server-settings__token-text">
              {t('serverSettings.ngrok.tokenRequired.description')}
            </p>
            <input
              type="text"
              className="input-field server-settings__token-input"
              placeholder={t('serverSettings.ngrok.tokenRequired.placeholder')}
              value={inputToken}
              onChange={(e) => setInputToken(e.target.value)}
            />
            <div className="server-settings__token-actions">
              <button
                onClick={() => setShowTokenModal(false)}
                className="btn-secondary server-settings__token-cancel"
              >
                {t('serverSettings.ngrok.tokenRequired.cancel')}
              </button>
              <button
                onClick={handleTokenSubmit}
                className="btn-primary server-settings__token-save disabled:opacity-50"
                disabled={!inputToken}
              >
                {t('serverSettings.ngrok.tokenRequired.saveAndConnect')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showVersionWizard && (
        <VersionUpgradeWizard
          server={server}
          onClose={() => setShowVersionWizard(false)}
          onServerUpdate={async (updated) => {
            await onSave(updated);
            setShowVersionWizard(false);
          }}
        />
      )}
    </div>
  );
};

export default ServerSettings;
