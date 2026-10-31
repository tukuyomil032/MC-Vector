import { Badge } from '@/components/arc/badge/badge';
import { Button } from '@/components/arc/button/button';
import { ChipGroup } from '@/components/arc/chip-group/chip-group';
import { Combobox } from '@/components/arc/combobox/combobox';
import { CopyButton } from '@/components/arc/copy-button/copy-button';
import { Dialog, DialogContent } from '@/components/arc/dialog/dialog';
import { Input } from '@/components/arc/input/input';
import { NumberField } from '@/components/arc/number-field/number-field';
import { PasswordField } from '@/components/arc/password-field/password-field';
import { Select, type SelectOption } from '@/components/arc/select/select';
import { Switch } from '@/components/arc/switch/switch';
import { Textarea } from '@/components/arc/textarea/textarea';
import { Archive, Bell, Cpu, Globe, RotateCw, Server } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../../i18n';
import { HintIcon } from '../ui/FieldLabel';
import { SectionTitle } from '../ui/IconTile';
import { useArcMessages } from '../../shared/arc-messages';
import { type JavaVersion, getJavaVersions } from '../../../lib/java-commands';
import {
  hasNgrokToken,
  onNgrokStatusChange,
  setNgrokToken,
  startNgrok,
  stopNgrok,
} from '../../../lib/ngrok-commands';
import { VERSION_OPTIONS } from '../../constants/versionOptions';
import { JVM_PRESETS } from '../../shared/jvm-presets';
import type { MinecraftServer } from '../../shared/server declaration';
import JavaManagerModal from '../JavaManagerModal';
import VersionUpgradeWizard from '../VersionUpgradeWizard';
import styles from './ServerSettings.module.css';
import { useUnsavedChangesGuard } from './use-unsaved-changes-guard';

interface ServerSettingsProps {
  server: MinecraftServer;
  onSave: (updatedServer: MinecraftServer) => Promise<void>;
  onServerVersionChanged: (serverId: string, version: string) => void;
  onOpenNgrokGuide: () => void;
}

type ScheduleType = 'interval' | 'daily' | 'weekly';
const SYSTEM_JAVA = '__system_default__';

/** Every editable field of the general settings, kept in one object so the form resets and saves as a unit. */
interface GeneralForm {
  name: string;
  profileName: string;
  groupName: string;
  software: string;
  version: string;
  memory: number;
  port: number;
  javaPath: string;
  jvmArgs: string;
  autoRestartOnCrash: boolean;
  maxAutoRestarts: number;
  autoRestartDelaySec: number;
  autoBackupEnabled: boolean;
  autoBackupIntervalMin: number;
  autoBackupScheduleType: ScheduleType;
  autoBackupTime: string;
  autoBackupWeekday: number;
  autoBackupRetainCount: number;
  autoBackupRetainDays: number;
  notifyOnCrash: boolean;
  notifyOnStart: boolean;
  notifyOnHighCpu: boolean;
  notifyHighCpuThreshold: number;
}

function toForm(server: MinecraftServer): GeneralForm {
  return {
    name: server.name,
    profileName: server.profileName || '',
    groupName: server.groupName || '',
    software: server.software || 'Paper',
    version: server.version,
    memory: server.memory,
    port: server.port,
    javaPath: server.javaPath || SYSTEM_JAVA,
    jvmArgs: server.jvmArgs ?? '',
    autoRestartOnCrash: Boolean(server.autoRestartOnCrash),
    maxAutoRestarts: server.maxAutoRestarts ?? 3,
    autoRestartDelaySec: server.autoRestartDelaySec ?? 5,
    autoBackupEnabled: Boolean(server.autoBackupEnabled),
    autoBackupIntervalMin: server.autoBackupIntervalMin ?? 60,
    autoBackupScheduleType: server.autoBackupScheduleType ?? 'interval',
    autoBackupTime: server.autoBackupTime ?? '03:00',
    autoBackupWeekday: server.autoBackupWeekday ?? 0,
    autoBackupRetainCount: server.autoBackupRetainCount ?? 0,
    autoBackupRetainDays: server.autoBackupRetainDays ?? 0,
    notifyOnCrash: server.notifyOnCrash !== false,
    notifyOnStart: Boolean(server.notifyOnStart),
    notifyOnHighCpu: Boolean(server.notifyOnHighCpu),
    notifyHighCpuThreshold: server.notifyHighCpuThreshold ?? 90,
  };
}

/** Clamps and trims the form the way it is saved. Dirty tracking compares normalized forms, so a value that saves as its clamped form is not reported as unsaved. */
function normalizeForm(form: GeneralForm): GeneralForm {
  return {
    ...form,
    profileName: form.profileName.trim(),
    groupName: form.groupName.trim(),
    jvmArgs: form.jvmArgs.trim(),
    maxAutoRestarts: Math.min(20, Math.max(0, Math.floor(form.maxAutoRestarts || 0))),
    autoRestartDelaySec: Math.min(300, Math.max(1, Math.floor(form.autoRestartDelaySec || 1))),
    autoBackupIntervalMin: Math.min(1440, Math.max(1, Math.floor(form.autoBackupIntervalMin || 1))),
    autoBackupScheduleType:
      form.autoBackupScheduleType === 'daily' || form.autoBackupScheduleType === 'weekly'
        ? form.autoBackupScheduleType
        : 'interval',
    autoBackupTime: /^([01]\d|2[0-3]):([0-5]\d)$/.test(form.autoBackupTime.trim())
      ? form.autoBackupTime.trim()
      : '03:00',
    autoBackupWeekday: Math.min(6, Math.max(0, Math.floor(form.autoBackupWeekday || 0))),
  };
}

/** Moves each field that still matches the previous server value onto the new one; edited fields are kept. */
function rebaseForm(current: GeneralForm, previous: GeneralForm, next: GeneralForm): GeneralForm {
  const moved = (Object.keys(next) as Array<keyof GeneralForm>).filter(
    (key) => current[key] === previous[key] && current[key] !== next[key],
  );
  if (moved.length === 0) return current;
  const result: GeneralForm = { ...current };
  for (const key of moved) {
    Object.assign(result, { [key]: next[key] });
  }
  return result;
}

/** Pairs each log line with a key that stays stable while the log grows. */
function withStableKeys(lines: string[]) {
  const seen = new Map<string, number>();
  return lines.map((line) => {
    const occurrence = seen.get(line) ?? 0;
    seen.set(line, occurrence + 1);
    return { key: `${occurrence}:${line}`, line };
  });
}

const ServerSettings: React.FC<ServerSettingsProps> = ({
  server,
  onSave,
  onServerVersionChanged,
  onOpenNgrokGuide,
}) => {
  const { t } = useTranslation();
  const arc = useArcMessages();
  const [form, setForm] = useState<GeneralForm>(() => toForm(server));
  const [isSaving, setIsSaving] = useState(false);

  const [showJavaManager, setShowJavaManager] = useState(false);
  const [showVersionWizard, setShowVersionWizard] = useState(false);
  const [installedJava, setInstalledJava] = useState<JavaVersion[]>([]);

  const [isTunneling, setIsTunneling] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [tunnelLog, setTunnelLog] = useState<string[]>([]);

  const [showTokenModal, setShowTokenModal] = useState(false);
  const [inputToken, setInputToken] = useState('');

  const setField = <K extends keyof GeneralForm>(key: K, value: GeneralForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // The form is reset only when a different server is shown. For the same server (status, port or other churn),
  // a field the user has not touched follows the new value, and a field the user edited keeps the edit.
  // The baseline is the server's saved values as last seen. A form that differs from it has unsaved edits.
  const [baseline, setBaseline] = useState<GeneralForm>(() => toForm(server));
  const baselineRef = useRef<GeneralForm>(baseline);
  const shownServerIdRef = useRef(server.id);
  const isDirty = JSON.stringify(normalizeForm(form)) !== JSON.stringify(normalizeForm(baseline));
  useUnsavedChangesGuard(isDirty);

  useEffect(() => {
    const next = toForm(server);
    if (shownServerIdRef.current !== server.id) {
      shownServerIdRef.current = server.id;
      baselineRef.current = next;
      setBaseline(next);
      setForm(next);
      void loadJavaList();
      return;
    }
    const previous = baselineRef.current;
    baselineRef.current = next;
    setBaseline(next);
    setForm((current) => rebaseForm(current, previous, next));
  }, [server]);

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

  const loadJavaList = async () => {
    const list = await getJavaVersions();
    setInstalledJava(list);
  };

  const weekdayOptions: SelectOption[] = [
    { value: '0', label: t('serverSettings.weekdays.sunday') },
    { value: '1', label: t('serverSettings.weekdays.monday') },
    { value: '2', label: t('serverSettings.weekdays.tuesday') },
    { value: '3', label: t('serverSettings.weekdays.wednesday') },
    { value: '4', label: t('serverSettings.weekdays.thursday') },
    { value: '5', label: t('serverSettings.weekdays.friday') },
    { value: '6', label: t('serverSettings.weekdays.saturday') },
  ];

  const standardGroup = t('serverSettings.softwareGroups.standard');
  const moddedGroup = t('serverSettings.softwareGroups.modded');
  const proxyGroup = t('serverSettings.softwareGroups.proxy');
  const softwareOptions: SelectOption[] = [
    {
      value: 'Vanilla',
      label: t('serverSettings.softwareOptions.vanilla'),
      group: standardGroup,
    },
    { value: 'Paper', label: t('serverSettings.softwareOptions.paper'), group: standardGroup },
    { value: 'LeafMC', label: t('serverSettings.softwareOptions.leafmc'), group: standardGroup },
    { value: 'Spigot', label: t('serverSettings.softwareOptions.spigot'), group: standardGroup },
    { value: 'Fabric', label: t('serverSettings.softwareOptions.fabric'), group: moddedGroup },
    { value: 'Forge', label: t('serverSettings.softwareOptions.forge'), group: moddedGroup },
    {
      value: 'NeoForge',
      label: t('serverSettings.softwareOptions.neoforge'),
      group: moddedGroup,
    },
    { value: 'Velocity', label: t('serverSettings.softwareOptions.velocity'), group: proxyGroup },
    {
      value: 'Waterfall',
      label: t('serverSettings.softwareOptions.waterfall'),
      group: proxyGroup,
    },
    {
      value: 'BungeeCord',
      label: t('serverSettings.softwareOptions.bungeecord'),
      group: proxyGroup,
    },
  ];

  const javaOptions: SelectOption[] = [
    { value: SYSTEM_JAVA, label: t('serverSettings.javaSystemDefault') },
    ...installedJava.map((j) => ({ value: j.path, label: `${j.name} (${j.path})` })),
  ];

  const selectedPreset = JVM_PRESETS.find((preset) => preset.args === form.jvmArgs)?.id;

  const handleSubmit = async () => {
    if (isSaving) {
      return;
    }

    const normalized = normalizeForm(form);

    setIsSaving(true);
    try {
      await onSave({
        ...server,
        name: normalized.name,
        profileName: normalized.profileName || undefined,
        groupName: normalized.groupName || undefined,
        version: normalized.version,
        memory: normalized.memory,
        port: normalized.port,
        path: server.path,
        software: normalized.software,
        javaPath: normalized.javaPath === SYSTEM_JAVA ? undefined : normalized.javaPath,
        autoRestartOnCrash: normalized.autoRestartOnCrash,
        maxAutoRestarts: normalized.maxAutoRestarts,
        autoRestartDelaySec: normalized.autoRestartDelaySec,
        autoBackupEnabled: normalized.autoBackupEnabled,
        autoBackupIntervalMin: normalized.autoBackupIntervalMin,
        autoBackupScheduleType: normalized.autoBackupScheduleType,
        autoBackupTime: normalized.autoBackupTime,
        autoBackupWeekday: normalized.autoBackupWeekday,
        autoBackupRetainCount: normalized.autoBackupRetainCount,
        autoBackupRetainDays: normalized.autoBackupRetainDays,
        jvmArgs: normalized.jvmArgs || undefined,
        notifyOnCrash: normalized.notifyOnCrash,
        notifyOnStart: normalized.notifyOnStart,
        notifyOnHighCpu: normalized.notifyOnHighCpu,
        notifyHighCpuThreshold: normalized.notifyHighCpuThreshold,
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
      setTunnelLog((prev) => [...prev, t('serverSettings.ngrok.initializing')]);
      await startNgrok('tcp', server.port, server.id);
      setInputToken('');
    } else {
      await stopNgrok();
    }
  };

  // Opening the change-token dialog must not clear the stored token: the old token stays
  // until a new one is submitted, so cancelling the dialog leaves the tunnel setup intact.
  const handleResetToken = () => {
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
    await startNgrok('tcp', server.port, server.id);
    setInputToken('');
  };

  const address = tunnelUrl ? tunnelUrl.replace('tcp://', '') : null;
  const logLines = withStableKeys(tunnelLog);

  const tokenFooter = (
    <>
      <Button
        variant="secondary"
        onClick={() => setShowTokenModal(false)}
        data-testid="ngrok-token-cancel"
      >
        {t('serverSettings.ngrok.tokenRequired.cancel')}
      </Button>
      <Button
        variant="primary"
        onClick={() => void handleTokenSubmit()}
        disabled={!inputToken}
        data-testid="ngrok-token-save"
      >
        {t('serverSettings.ngrok.tokenRequired.saveAndConnect')}
      </Button>
    </>
  );

  return (
    <div className={styles.page} data-testid="server-settings-view">
      <header className={styles.header}>
        <h2 className={styles.title}>{t('serverSettings.title')}</h2>
        <div className={styles.saveBar}>
          {isDirty && (
            <span className={styles.unsaved} role="status">
              {t('serverSettings.unsavedChanges')}
            </span>
          )}
          <Button
            variant="primary"
            type="button"
            onClick={() => {
              void handleSubmit();
            }}
            disabled={isSaving || !isDirty}
            data-testid="server-settings-save-button"
          >
            {t('serverSettings.saveSettings')}
          </Button>
        </div>
      </header>

      <section
        className={`${styles.card} ${styles.cardFull}`}
        aria-labelledby="server-settings-basic"
      >
        <SectionTitle
          icon={Server}
          as="h3"
          id="server-settings-basic"
          title={t('serverSettings.basicConfig')}
        />
        <div className={styles.grid}>
          <div className={styles.wide}>
            <Input
              label={t('serverSettings.serverName')}
              type="text"
              value={form.name}
              data-testid="server-settings-name-input"
              onChange={(e) => setField('name', e.target.value)}
            />
          </div>
          <Input
            label={t('serverSettings.profileName')}
            type="text"
            value={form.profileName}
            onChange={(e) => setField('profileName', e.target.value)}
            placeholder={t('serverSettings.profileNamePlaceholder')}
          />
          <Input
            label={t('serverSettings.groupName')}
            type="text"
            value={form.groupName}
            onChange={(e) => setField('groupName', e.target.value)}
            placeholder={t('serverSettings.groupNamePlaceholder')}
          />
          <Select
            label={t('serverSettings.serverSoftware')}
            placeholder={arc.select.placeholder}
            value={form.software}
            onValueChange={(value) => setField('software', value)}
            options={softwareOptions}
          />
          <Combobox
            label={t('serverSettings.version')}
            value={form.version}
            onValueChange={(value) => setField('version', value)}
            options={VERSION_OPTIONS.map((v) => ({ value: v, label: v }))}
          />
          <div className={styles.actionCell}>
            <Button variant="secondary" type="button" onClick={() => setShowVersionWizard(true)}>
              {t('serverSettings.versionUpgrade.buttonLabel')}
            </Button>
          </div>
          <div className={styles.wide}>
            <div className={styles.javaRow}>
              <div className={styles.javaSelect}>
                <Select
                  label={t('serverSettings.javaRuntime')}
                  placeholder={arc.select.placeholder}
                  value={form.javaPath}
                  onValueChange={(value) => setField('javaPath', value)}
                  options={javaOptions}
                />
              </div>
              <Button
                variant="secondary"
                data-testid="server-settings-java-manage-button"
                onClick={() => {
                  setShowJavaManager(true);
                  void loadJavaList();
                }}
              >
                {t('serverSettings.manageJava')}
              </Button>
            </div>
          </div>
          <div className={styles.pair}>
            <NumberField
              label={t('serverSettings.memory')}
              value={form.memory}
              onValueChange={(value) => setField('memory', value)}
            />
            <NumberField
              label={t('serverSettings.port')}
              min={1}
              max={65535}
              formatOptions={{ useGrouping: false }}
              value={form.port}
              onValueChange={(value) => setField('port', value)}
            />
          </div>
          <div className={styles.wide}>
            <Input label={t('serverSettings.savePath')} type="text" value={server.path} readOnly />
          </div>
        </div>
      </section>

      <section className={styles.card} aria-labelledby="server-settings-jvm">
        <SectionTitle
          icon={Cpu}
          as="h3"
          id="server-settings-jvm"
          title={t('serverSettings.jvmArgs.label')}
        />
        <ChipGroup
          label={t('serverSettings.jvmArgs.presetsLabel')}
          options={JVM_PRESETS.map((preset) => ({ value: preset.id, label: t(preset.labelKey) }))}
          value={selectedPreset ? [selectedPreset] : []}
          onValueChange={(next) => {
            const id = next[0];
            const preset = JVM_PRESETS.find((item) => item.id === id);
            setField('jvmArgs', preset?.args ?? '');
          }}
        />
        <Textarea
          label={t('serverSettings.jvmArgs.customLabel')}
          hint={t('serverSettings.jvmArgs.help')}
          value={form.jvmArgs}
          onChange={(e) => setField('jvmArgs', e.target.value)}
          placeholder={t('serverSettings.jvmArgs.placeholder')}
          rows={3}
        />
        {form.jvmArgs && (
          <div>
            <Button variant="ghost" size="sm" onClick={() => setField('jvmArgs', '')}>
              {t('serverSettings.jvmArgs.clear')}
            </Button>
          </div>
        )}
      </section>

      <section className={styles.card} aria-labelledby="server-settings-restart">
        <SectionTitle
          icon={RotateCw}
          as="h3"
          id="server-settings-restart"
          title={t('serverSettings.autoRestart.title')}
          trailing={
            <>
              <HintIcon
                hint={t('serverSettings.autoRestart.enableDescription')}
                label={t('serverSettings.autoRestart.title')}
              />
              <Switch
                aria-labelledby="server-settings-restart"
                checked={form.autoRestartOnCrash}
                onCheckedChange={(value) => setField('autoRestartOnCrash', value)}
                data-testid="auto-restart-toggle"
              />
            </>
          }
        />
        <div className={styles.grid}>
          <NumberField
            label={t('serverSettings.autoRestart.maxRetries')}
            min={0}
            max={20}
            value={form.maxAutoRestarts}
            disabled={!form.autoRestartOnCrash}
            onValueChange={(value) => setField('maxAutoRestarts', value)}
          />
          <NumberField
            label={t('serverSettings.autoRestart.delaySeconds')}
            min={1}
            max={300}
            value={form.autoRestartDelaySec}
            disabled={!form.autoRestartOnCrash}
            onValueChange={(value) => setField('autoRestartDelaySec', value)}
          />
        </div>
      </section>

      <section className={styles.card} aria-labelledby="server-settings-backup">
        <SectionTitle
          icon={Archive}
          as="h3"
          id="server-settings-backup"
          title={t('serverSettings.autoBackup.title')}
          trailing={
            <>
              <HintIcon
                hint={t('serverSettings.autoBackup.enableDescription')}
                label={t('serverSettings.autoBackup.title')}
              />
              <Switch
                aria-labelledby="server-settings-backup"
                checked={form.autoBackupEnabled}
                onCheckedChange={(value) => setField('autoBackupEnabled', value)}
                data-testid="auto-backup-toggle"
              />
            </>
          }
        />
        <div className={styles.grid}>
          <Select
            label={t('serverSettings.autoBackup.scheduleType')}
            placeholder={arc.select.placeholder}
            value={form.autoBackupScheduleType}
            disabled={!form.autoBackupEnabled}
            onValueChange={(value) => setField('autoBackupScheduleType', value as ScheduleType)}
            options={[
              { value: 'interval', label: t('serverSettings.autoBackup.scheduleOptions.interval') },
              { value: 'daily', label: t('serverSettings.autoBackup.scheduleOptions.daily') },
              { value: 'weekly', label: t('serverSettings.autoBackup.scheduleOptions.weekly') },
            ]}
          />
          {form.autoBackupScheduleType === 'interval' ? (
            <NumberField
              label={t('serverSettings.autoBackup.intervalMinutes')}
              min={1}
              max={1440}
              value={form.autoBackupIntervalMin}
              disabled={!form.autoBackupEnabled}
              onValueChange={(value) => setField('autoBackupIntervalMin', value)}
            />
          ) : (
            <Input
              label={t('serverSettings.autoBackup.executionTime')}
              type="time"
              value={form.autoBackupTime}
              disabled={!form.autoBackupEnabled}
              onChange={(event) => setField('autoBackupTime', event.target.value)}
            />
          )}
          {form.autoBackupScheduleType === 'weekly' && (
            <Select
              label={t('serverSettings.autoBackup.weekday')}
              placeholder={arc.select.placeholder}
              value={String(form.autoBackupWeekday)}
              disabled={!form.autoBackupEnabled}
              onValueChange={(value) => setField('autoBackupWeekday', Number(value))}
              options={weekdayOptions}
            />
          )}
          <NumberField
            label={t('serverSettings.autoBackup.retainCount')}
            min={0}
            max={999}
            value={form.autoBackupRetainCount}
            disabled={!form.autoBackupEnabled}
            onValueChange={(value) => setField('autoBackupRetainCount', value)}
          />
          <NumberField
            label={t('serverSettings.autoBackup.retainDays')}
            min={0}
            max={365}
            value={form.autoBackupRetainDays}
            disabled={!form.autoBackupEnabled}
            onValueChange={(value) => setField('autoBackupRetainDays', value)}
          />
        </div>
      </section>

      <section className={styles.card} aria-labelledby="server-settings-notifications">
        <SectionTitle
          icon={Bell}
          as="h3"
          id="server-settings-notifications"
          title={t('serverSettings.notifications.title')}
        />
        <NotificationRow
          label={t('serverSettings.notifications.onCrash')}
          checked={form.notifyOnCrash}
          onChange={(value) => setField('notifyOnCrash', value)}
        />
        <NotificationRow
          label={t('serverSettings.notifications.onStart')}
          checked={form.notifyOnStart}
          onChange={(value) => setField('notifyOnStart', value)}
        />
        <NotificationRow
          label={t('serverSettings.notifications.onHighCpu')}
          checked={form.notifyOnHighCpu}
          onChange={(value) => setField('notifyOnHighCpu', value)}
        />
        {form.notifyOnHighCpu && (
          <NumberField
            label={t('serverSettings.notifications.cpuThreshold')}
            min={1}
            max={100}
            value={form.notifyHighCpuThreshold}
            onValueChange={(value) => setField('notifyHighCpuThreshold', value)}
          />
        )}
      </section>

      <section
        className={`${styles.card} ${styles.cardFull}`}
        aria-labelledby="server-settings-ngrok"
        data-active={isTunneling || undefined}
      >
        <SectionTitle
          icon={Globe}
          as="h3"
          id="server-settings-ngrok"
          title={
            <>
              {t('serverSettings.ngrok.title')}
              {isTunneling && (
                <Badge tone="success" data-testid="ngrok-online-badge">
                  {t('serverSettings.ngrok.onlineBadge')}
                </Badge>
              )}
            </>
          }
          trailing={
            <>
              <HintIcon
                hint={t('serverSettings.ngrok.description')}
                label={t('serverSettings.ngrok.title')}
              />
              <Switch
                aria-labelledby="server-settings-ngrok"
                checked={isTunneling}
                onCheckedChange={() => {
                  void handleToggleTunnel();
                }}
                data-testid="ngrok-toggle"
              />
            </>
          }
        />

        <div className={styles.actionRow}>
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenNgrokGuide}
            data-testid="ngrok-connection-guide-button"
          >
            {t('serverSettings.ngrok.connectionGuide')}
          </Button>
          <Button variant="secondary" size="sm" onClick={handleResetToken}>
            {t('serverSettings.ngrok.changeToken')}
          </Button>
        </div>

        {(isTunneling || tunnelLog.length > 0) && (
          <div className={styles.tunnelStatus}>
            {address && (
              <div className={styles.address}>
                <span className={styles.helpText}>
                  {t('serverSettings.ngrok.publicAddress')} (
                  {t('serverSettings.ngrok.shareWithFriends')})
                </span>
                <div className={styles.addressRow}>
                  <code className={styles.addressCode}>{address}</code>
                  <CopyButton value={address} label={t('common.copy')} messages={arc.copy} />
                </div>
              </div>
            )}

            <div className={styles.log} role="log" aria-live="polite" data-testid="ngrok-log">
              {logLines.length === 0 && <div>{t('serverSettings.ngrok.ready')}</div>}
              {logLines.map(({ key, line }) => (
                <div key={key} className={styles.logLine}>
                  {line}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <JavaManagerModal
        open={showJavaManager}
        onClose={() => {
          setShowJavaManager(false);
          void loadJavaList();
        }}
      />

      <Dialog
        open={showTokenModal}
        onOpenChange={(next) => {
          if (!next) setShowTokenModal(false);
        }}
      >
        <DialogContent
          title={t('serverSettings.ngrok.tokenRequired.title')}
          description={t('serverSettings.ngrok.tokenRequired.description')}
          footer={tokenFooter}
          data-testid="ngrok-token-dialog"
        >
          <PasswordField
            label={t('serverSettings.ngrok.tokenRequired.label')}
            autoComplete="new-password"
            data-testid="ngrok-token-input"
            placeholder={t('serverSettings.ngrok.tokenRequired.placeholder')}
            value={inputToken}
            onChange={(e) => setInputToken(e.target.value)}
          />
        </DialogContent>
      </Dialog>

      {showVersionWizard && (
        <VersionUpgradeWizard
          server={server}
          onClose={() => setShowVersionWizard(false)}
          onServerVersionChanged={(version) => {
            setField('version', version);
            onServerVersionChanged(server.id, version);
            setShowVersionWizard(false);
          }}
        />
      )}
    </div>
  );
};

function NotificationRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className={styles.checkRow}>
      <span className={styles.toggleLabel}>{label}</span>
      <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export default ServerSettings;
