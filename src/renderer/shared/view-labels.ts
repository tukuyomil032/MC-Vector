import type { AppView } from './server declaration';

type Translate = (key: string, values?: Record<string, unknown>) => string;

export function getViewLabel(view: AppView, t: Translate): string {
  switch (view) {
    case 'dashboard':
      return t('nav.dashboard');
    case 'console':
      return t('nav.console');
    case 'users':
      return t('nav.users');
    case 'files':
      return t('nav.files');
    case 'plugins':
      return t('nav.pluginsMods');
    case 'backups':
      return t('nav.backups');
    case 'properties':
      return t('nav.properties');
    case 'general-settings':
      return t('nav.generalSettings');
    case 'proxy':
      return t('nav.proxyNetwork');
    case 'app-settings':
      return t('settings.title');
    case 'proxy-help':
      return t('proxyHelp.title');
    case 'ngrok-guide':
      return t('ngrokGuide.title');
    default:
      return view;
  }
}

export function getHeaderTitle(
  view: AppView,
  activeServerName: string | undefined,
  t: Translate,
): string {
  if (view === 'proxy') {
    return t('nav.proxyNetwork');
  }
  if (view === 'app-settings') {
    return t('settings.title');
  }
  if (view === 'proxy-help') {
    return t('proxyHelp.title');
  }
  if (view === 'ngrok-guide') {
    return t('ngrokGuide.title');
  }
  return activeServerName || t('nav.servers');
}
