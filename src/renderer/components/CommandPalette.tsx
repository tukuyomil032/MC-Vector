import { Command } from 'cmdk';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/i18n';
import type { AppView, MinecraftServer } from '@/renderer/shared/server declaration';

interface CommandPaletteProps {
  activeServer: MinecraftServer | undefined;
  setCurrentView: (view: AppView) => void;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
}

export function CommandPalette({
  activeServer,
  setCurrentView,
  onStart,
  onStop,
  onRestart,
}: CommandPaletteProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const runAndClose = (fn: () => void) => {
    fn();
    setOpen(false);
  };

  const isOnline = activeServer?.status === 'online';
  const isOffline = activeServer?.status === 'offline';

  if (!open) return null;

  return (
    <div
      className="cmd-palette-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <Command className="cmd-palette" loop>
        <div className="cmd-palette__input-wrap">
          <span className="cmd-palette__icon">⌘</span>
          <Command.Input
            ref={inputRef}
            className="cmd-palette__input"
            placeholder={t('commandPalette.placeholder')}
          />
        </div>

        <Command.List className="cmd-palette__list">
          <Command.Empty className="cmd-palette__empty">
            {t('commandPalette.noResults')}
          </Command.Empty>

          <Command.Group
            heading={
              <span className="cmd-palette__group-label">{t('commandPalette.navigate')}</span>
            }
          >
            <Command.Item
              className="cmd-palette__item"
              onSelect={() => runAndClose(() => setCurrentView('dashboard'))}
            >
              <span className="cmd-palette__item-icon">📊</span>
              <span className="cmd-palette__item-label">{t('nav.dashboard')}</span>
            </Command.Item>
            <Command.Item
              className="cmd-palette__item"
              onSelect={() => runAndClose(() => setCurrentView('console'))}
            >
              <span className="cmd-palette__item-icon">🖥</span>
              <span className="cmd-palette__item-label">{t('nav.console')}</span>
            </Command.Item>
            <Command.Item
              className="cmd-palette__item"
              onSelect={() => runAndClose(() => setCurrentView('users'))}
            >
              <span className="cmd-palette__item-icon">👥</span>
              <span className="cmd-palette__item-label">{t('nav.users')}</span>
            </Command.Item>
            <Command.Item
              className="cmd-palette__item"
              onSelect={() => runAndClose(() => setCurrentView('files'))}
            >
              <span className="cmd-palette__item-icon">📁</span>
              <span className="cmd-palette__item-label">{t('nav.files')}</span>
            </Command.Item>
            <Command.Item
              className="cmd-palette__item"
              onSelect={() => runAndClose(() => setCurrentView('plugins'))}
            >
              <span className="cmd-palette__item-icon">🔌</span>
              <span className="cmd-palette__item-label">{t('nav.pluginsMods')}</span>
            </Command.Item>
            <Command.Item
              className="cmd-palette__item"
              onSelect={() => runAndClose(() => setCurrentView('backups'))}
            >
              <span className="cmd-palette__item-icon">💾</span>
              <span className="cmd-palette__item-label">{t('nav.backups')}</span>
            </Command.Item>
            <Command.Item
              className="cmd-palette__item"
              onSelect={() => runAndClose(() => setCurrentView('general-settings'))}
            >
              <span className="cmd-palette__item-icon">⚙️</span>
              <span className="cmd-palette__item-label">{t('nav.generalSettings')}</span>
            </Command.Item>
          </Command.Group>

          {activeServer && (
            <Command.Group
              heading={
                <span className="cmd-palette__group-label">
                  {t('commandPalette.serverActions')}
                </span>
              }
            >
              {isOffline && (
                <Command.Item className="cmd-palette__item" onSelect={() => runAndClose(onStart)}>
                  <span className="cmd-palette__item-icon">▶</span>
                  <span className="cmd-palette__item-label">{t('server.actions.start')}</span>
                  <span className="cmd-palette__item-badge">{activeServer.name}</span>
                </Command.Item>
              )}
              {isOnline && (
                <>
                  <Command.Item className="cmd-palette__item" onSelect={() => runAndClose(onStop)}>
                    <span className="cmd-palette__item-icon">⏹</span>
                    <span className="cmd-palette__item-label">{t('server.actions.stop')}</span>
                    <span className="cmd-palette__item-badge">{activeServer.name}</span>
                  </Command.Item>
                  <Command.Item
                    className="cmd-palette__item"
                    onSelect={() => runAndClose(onRestart)}
                  >
                    <span className="cmd-palette__item-icon">🔄</span>
                    <span className="cmd-palette__item-label">{t('server.actions.restart')}</span>
                    <span className="cmd-palette__item-badge">{activeServer.name}</span>
                  </Command.Item>
                </>
              )}
            </Command.Group>
          )}
        </Command.List>
      </Command>
    </div>
  );
}
