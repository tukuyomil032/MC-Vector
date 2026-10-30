import { useState } from 'react';
import { useTranslation } from '../../i18n';
import type { LocaleCode } from '../../i18n';
import { saveAppSettings } from '../../lib/config-commands';
import { logError } from '../../lib/error-utils';
import type { AppUpdaterSettings } from '../hooks/use-app-updater';
import { useSettingsStore, type UpdateChannel } from '../../store/settingsStore';
import { Button } from './ui/Button';
import { NativeSelect } from './ui/Field';

const SettingsWindow = ({
  onClose,
  onCheckForUpdates,
  updateCheckStatus,
  updateCheckError,
  updatePrompt,
  updateProgress,
}: AppUpdaterSettings & { onClose?: () => void }) => {
  const { t, locale, setLocale } = useTranslation();
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

  return (
    <div data-testid="app-settings-view">
      <div
        className="settings-window box-border h-full overflow-y-auto p-8 max-[900px]:p-4"
        data-testid="settings-window"
      >
        <div className="settings-window__header">
          {onClose && (
            <Button variant="secondary" data-testid="settings-back-button" onClick={onClose}>
              {t('settings.backButton')}
            </Button>
          )}
          <h1 className="text-2xl font-semibold m-0">{t('settings.title')}</h1>
        </div>

        <section className="settings-window__section">
          <div className="settings-window__section-head">
            <div>
              <h2 className="text-lg m-0">{t('settings.update.title')}</h2>
              <p className="text-sm text-zinc-400 m-0">{t('settings.update.description')}</p>
            </div>
            <div className="flex gap-2">
              {updateCheckStatus !== 'checking' && (
                <Button
                  variant="secondary"
                  data-testid="update-check-button"
                  onClick={() => void onCheckForUpdates()}
                  disabled={updateProgress !== null}
                >
                  {t('settings.update.checkButton')}
                </Button>
              )}
            </div>
          </div>

          <div
            className="settings-window__status-body"
            data-testid="update-status"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {updateCheckStatus === 'idle' && <div>{t('settings.update.idle')}</div>}
            {updateCheckStatus === 'checking' && <div>{t('settings.update.checkingStatus')}</div>}
            {updateCheckStatus === 'available' && updatePrompt && (
              <div
                className="text-accent font-semibold"
                data-testid="update-status-version"
                data-version={updatePrompt.version || 'unknown'}
              >
                {t('settings.update.available', { version: updatePrompt.version || 'unknown' })}
              </div>
            )}
            {updateCheckStatus === 'not-available' && (
              <div>{t('settings.update.notAvailable')}</div>
            )}
            {updateCheckStatus === 'error' && (
              <div className="text-red-400">
                {t('settings.update.error', { message: updateCheckError || '' })}
              </div>
            )}
          </div>

          <div className="mt-4">
            <label className="text-sm text-zinc-300 block mb-2" htmlFor="update-channel-select">
              {t('settings.update.channelLabel')}
            </label>
            <NativeSelect
              id="update-channel-select"
              data-testid="update-channel-select"
              value={updateChannel}
              disabled={updateProgress !== null}
              aria-describedby="update-channel-description"
              onChange={(event) =>
                void handleUpdateChannelChange(event.target.value as UpdateChannel)
              }
            >
              <option value="stable">{t('settings.update.channels.stable')}</option>
              <option value="beta">{t('settings.update.channels.beta')}</option>
            </NativeSelect>
            <p id="update-channel-description" className="text-sm text-zinc-400 mt-2 mb-0">
              {updateChannel === 'beta'
                ? t('settings.update.betaDescription')
                : t('settings.update.stableDescription')}
            </p>
            {updateChannelError && (
              <p className="text-sm text-red-400 mt-2 mb-0" role="alert">
                {updateChannelError}
              </p>
            )}
          </div>
        </section>

        <section className="settings-window__section">
          <div className="settings-window__section-head">
            <div>
              <h2 className="text-lg m-0">{t('settings.language.title')}</h2>
              <p className="text-sm text-zinc-400 m-0">{t('settings.language.description')}</p>
            </div>
          </div>

          <label className="text-sm text-zinc-300 block mb-2" htmlFor="language-select">
            {t('settings.language.label')}
          </label>
          <NativeSelect
            id="language-select"
            className="settings-window__theme-select"
            value={locale}
            onChange={(e) => handleLanguageChange(e.target.value as LocaleCode)}
          >
            <option value="en">{t('settings.language.options.en')}</option>
            <option value="ja">{t('settings.language.options.ja')}</option>
          </NativeSelect>
        </section>

        <section className="settings-window__section">
          <div className="settings-window__section-head">
            <div>
              <h2 className="text-lg m-0">{t('settings.security.title')}</h2>
              <p className="text-sm text-zinc-400 m-0">{t('settings.security.description')}</p>
            </div>
          </div>

          <label
            className="settings-window__toggle-row"
            htmlFor="allow-unverified-plugin-downloads"
          >
            <input
              id="allow-unverified-plugin-downloads"
              type="checkbox"
              checked={allowUnverifiedPluginDownloads}
              disabled={isSavingSecuritySetting}
              aria-describedby="allow-unverified-plugin-downloads-warning"
              onChange={(e) => void handleAllowUnverifiedPluginDownloadsToggle(e.target.checked)}
            />
            <span>{t('settings.security.label')}</span>
          </label>
          <p
            id="allow-unverified-plugin-downloads-warning"
            className="text-sm text-amber-300 mt-3 mb-0"
          >
            {t('settings.security.warning')}
          </p>
          {isSavingSecuritySetting && (
            <p className="text-sm text-zinc-400 mt-2 mb-0" aria-live="polite">
              {t('settings.security.saving')}
            </p>
          )}
          {securitySettingError && (
            <p className="text-sm text-red-400 mt-2 mb-0" role="alert">
              {securitySettingError}
            </p>
          )}
        </section>

        <section className="settings-window__section">
          <div className="settings-window__section-head">
            <div>
              <h2 className="text-lg m-0">{t('settings.liquidGlass.title')}</h2>
              <p className="text-sm text-zinc-400 m-0">{t('settings.liquidGlass.description')}</p>
            </div>
          </div>

          <label className="settings-window__toggle-row" htmlFor="liquid-glass-toggle">
            <input
              id="liquid-glass-toggle"
              type="checkbox"
              checked={liquidGlassEnabled}
              onChange={(e) => void handleLiquidGlassToggle(e.target.checked)}
            />
            <span>{t('settings.liquidGlass.label')}</span>
          </label>
        </section>
      </div>
    </div>
  );
};

export default SettingsWindow;
