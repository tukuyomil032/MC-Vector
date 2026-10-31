import { Alert } from '@/components/arc/alert/alert';
import { Button } from '@/components/arc/button/button';
import { Select } from '@/components/arc/select/select';
import { Switch } from '@/components/arc/switch/switch';
import { useState } from 'react';
import { useTranslation } from '../../i18n';
import type { LocaleCode } from '../../i18n';
import { useArcMessages } from '../shared/arc-messages';
import { saveAppSettings } from '../../lib/config-commands';
import { logError } from '../../lib/error-utils';
import type { AppUpdaterSettings } from '../hooks/use-app-updater';
import { useSettingsStore, type UpdateChannel } from '../../store/settingsStore';
import styles from './SettingsWindow.module.css';

const SettingsWindow = ({
  onClose,
  onCheckForUpdates,
  updateCheckStatus,
  updateCheckError,
  updatePrompt,
  updateProgress,
}: AppUpdaterSettings & { onClose?: () => void }) => {
  const { t, locale, setLocale } = useTranslation();
  const arc = useArcMessages();
  const [isSavingSecuritySetting, setIsSavingSecuritySetting] = useState(false);
  const [securitySettingError, setSecuritySettingError] = useState<string | undefined>();
  const [updateChannelError, setUpdateChannelError] = useState<string | undefined>();
  const liquidGlassEnabled = useSettingsStore((state) => state.liquidGlassEnabled);
  const setLiquidGlassEnabled = useSettingsStore((state) => state.setLiquidGlassEnabled);
  const allowUnverifiedPluginDownloads = useSettingsStore(
    (state) => state.allowUnverifiedPluginDownloads,
  );
  const setAllowUnverifiedPluginDownloads = useSettingsStore(
    (state) => state.setAllowUnverifiedPluginDownloads,
  );
  const updateChannel = useSettingsStore((state) => state.updateChannel);
  const setUpdateChannel = useSettingsStore((state) => state.setUpdateChannel);

  const handleUpdateChannelChange = async (channel: UpdateChannel) => {
    const previousChannel = updateChannel;
    setUpdateChannel(channel);
    setUpdateChannelError(undefined);
    try {
      await saveAppSettings({ updateChannel: channel });
      window.dispatchEvent(new CustomEvent('mc-vector:update-channel-changed'));
    } catch (error) {
      setUpdateChannel(previousChannel);
      setUpdateChannelError(t('settings.update.channelSaveError'));
      logError('Failed to persist update channel', error, { channel });
    }
  };

  const handleLanguageChange = async (value: LocaleCode) => {
    await setLocale(value);
  };

  const handleLiquidGlassToggle = async (enabled: boolean) => {
    setLiquidGlassEnabled(enabled);
    try {
      await saveAppSettings({ liquidGlassEnabled: enabled });
    } catch (error) {
      logError('Failed to persist liquid glass enabled setting', error, { enabled });
    }
  };

  const handleAllowUnverifiedPluginDownloadsToggle = async (enabled: boolean) => {
    if (isSavingSecuritySetting) {
      return;
    }
    const previousValue = allowUnverifiedPluginDownloads;
    setSecuritySettingError(undefined);
    setAllowUnverifiedPluginDownloads(enabled);
    setIsSavingSecuritySetting(true);

    try {
      await saveAppSettings({ allowUnverifiedPluginDownloads: enabled });
    } catch (error) {
      setAllowUnverifiedPluginDownloads(previousValue);
      setSecuritySettingError(t('settings.security.saveError'));
      logError('Failed to persist unverified plugin downloads setting', error, { enabled });
    } finally {
      setIsSavingSecuritySetting(false);
    }
  };

  const channelOptions = [
    { value: 'stable', label: t('settings.update.channels.stable') },
    { value: 'beta', label: t('settings.update.channels.beta') },
  ];
  const languageOptions = [
    { value: 'en', label: t('settings.language.options.en') },
    { value: 'ja', label: t('settings.language.options.ja') },
  ];

  return (
    <div data-testid="app-settings-view">
      <div className={styles.page} data-testid="settings-window">
        <header className={styles.header}>
          {onClose && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              data-testid="settings-back-button"
              onClick={onClose}
            >
              {t('settings.backButton')}
            </Button>
          )}
          <h1 className={styles.title}>{t('settings.title')}</h1>
        </header>

        <section className={styles.card} aria-labelledby="settings-update-title">
          <div className={styles.cardHead}>
            <div>
              <h2 id="settings-update-title" className={styles.cardTitle}>
                {t('settings.update.title')}
              </h2>
              <p className={styles.cardDescription}>{t('settings.update.description')}</p>
            </div>
            {updateCheckStatus !== 'checking' && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                data-testid="update-check-button"
                onClick={() => void onCheckForUpdates()}
                disabled={updateProgress !== null}
              >
                {t('settings.update.checkButton')}
              </Button>
            )}
          </div>

          <div
            className={styles.status}
            data-testid="update-status"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {updateCheckStatus === 'idle' && (
              <span className={styles.muted}>{t('settings.update.idle')}</span>
            )}
            {updateCheckStatus === 'checking' && (
              <span className={styles.muted}>{t('settings.update.checkingStatus')}</span>
            )}
            {updateCheckStatus === 'available' && updatePrompt && (
              <span
                className={styles.accent}
                data-testid="update-status-version"
                data-version={updatePrompt.version || 'unknown'}
              >
                {t('settings.update.available', { version: updatePrompt.version || 'unknown' })}
              </span>
            )}
            {updateCheckStatus === 'not-available' && (
              <span className={styles.success}>{t('settings.update.notAvailable')}</span>
            )}
            {updateCheckStatus === 'error' && (
              <Alert
                tone="danger"
                title={t('settings.update.error', { message: updateCheckError || '' })}
              />
            )}
          </div>

          <Select
            label={t('settings.update.channelLabel')}
            placeholder={arc.select.placeholder}
            testId="update-channel-select"
            options={channelOptions}
            value={updateChannel}
            disabled={updateProgress !== null}
            description={
              updateChannel === 'beta'
                ? t('settings.update.betaDescription')
                : t('settings.update.stableDescription')
            }
            onValueChange={(value) => void handleUpdateChannelChange(value as UpdateChannel)}
          />
          {updateChannelError && <Alert tone="danger" title={updateChannelError} />}
        </section>

        <section className={styles.card} aria-labelledby="settings-language-title">
          <div>
            <h2 id="settings-language-title" className={styles.cardTitle}>
              {t('settings.language.title')}
            </h2>
            <p className={styles.cardDescription}>{t('settings.language.description')}</p>
          </div>
          <Select
            id="language-select"
            label={t('settings.language.label')}
            placeholder={arc.select.placeholder}
            options={languageOptions}
            value={locale}
            onValueChange={(value) => void handleLanguageChange(value as LocaleCode)}
          />
        </section>

        <section className={styles.card} aria-labelledby="settings-security-title">
          <div>
            <h2 id="settings-security-title" className={styles.cardTitle}>
              {t('settings.security.title')}
            </h2>
            <p className={styles.cardDescription}>{t('settings.security.description')}</p>
          </div>
          <Switch
            id="allow-unverified-plugin-downloads"
            label={t('settings.security.label')}
            checked={allowUnverifiedPluginDownloads}
            disabled={isSavingSecuritySetting}
            aria-describedby="allow-unverified-plugin-downloads-warning"
            onCheckedChange={(checked) => void handleAllowUnverifiedPluginDownloadsToggle(checked)}
          />
          <Alert
            id="allow-unverified-plugin-downloads-warning"
            tone="warning"
            title={t('settings.security.warning')}
          />
          {isSavingSecuritySetting && (
            <p className={styles.muted} aria-live="polite">
              {t('settings.security.saving')}
            </p>
          )}
          {securitySettingError && <Alert tone="danger" title={securitySettingError} />}
        </section>

        <section className={styles.card} aria-labelledby="settings-glass-title">
          <div>
            <h2 id="settings-glass-title" className={styles.cardTitle}>
              {t('settings.liquidGlass.title')}
            </h2>
            <p className={styles.cardDescription}>{t('settings.liquidGlass.description')}</p>
          </div>
          <Switch
            id="liquid-glass-toggle"
            label={t('settings.liquidGlass.label')}
            checked={liquidGlassEnabled}
            onCheckedChange={(checked) => void handleLiquidGlassToggle(checked)}
          />
        </section>
      </div>
    </div>
  );
};

export default SettingsWindow;
