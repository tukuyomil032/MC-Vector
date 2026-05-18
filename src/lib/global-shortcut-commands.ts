import {
  isRegistered,
  register,
  unregisterAll,
} from '@tauri-apps/plugin-global-shortcut';

export type GlobalShortcutHandler = {
  onStartStop: () => void;
  onRestart: () => void;
};

const SHORTCUT_START_STOP = 'CmdOrCtrl+Shift+S';
const SHORTCUT_RESTART = 'CmdOrCtrl+Shift+R';

export async function registerGlobalShortcuts(handlers: GlobalShortcutHandler): Promise<void> {
  const alreadyRegistered = await isRegistered(SHORTCUT_START_STOP);
  if (alreadyRegistered) return;

  await register(SHORTCUT_START_STOP, handlers.onStartStop);
  await register(SHORTCUT_RESTART, handlers.onRestart);
}

export async function unregisterGlobalShortcuts(): Promise<void> {
  await unregisterAll();
}
