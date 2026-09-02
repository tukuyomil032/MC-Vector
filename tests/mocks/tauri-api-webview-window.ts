import { getE2eState, recordE2eCall } from '../e2e/support/e2e-runtime';
import { emit as emitAppEvent } from './tauri-api-event';

export class WebviewWindow {
  label: string;
  constructor(label: string, _options?: unknown) {
    this.label = label;
  }
  static getByLabel(_label: string): WebviewWindow | null {
    return null;
  }
  async listen(event: string, _handler: unknown) {
    recordE2eCall('ipc', `webview.listen:${event}`, { label: this.label });
    return () => {};
  }
  once(event: string, handler: unknown) {
    recordE2eCall('ipc', `webview.once:${event}`, { label: this.label });
    if (event === 'tauri://created' && typeof handler === 'function') {
      queueMicrotask(() => (handler as (event: unknown) => void)({}));
    }
    return () => {};
  }
  async show() {
    recordE2eCall('ipc', 'webview.show', { label: this.label });
  }
  async hide() {
    recordE2eCall('ipc', 'webview.hide', { label: this.label });
  }
  async close() {
    recordE2eCall('ipc', 'webview.close', { label: this.label });
  }
  async setFocus() {
    recordE2eCall('ipc', 'webview.setFocus', { label: this.label });
  }
  async emit(event: string, payload?: unknown) {
    recordE2eCall('ipc', `webview.emit:${event}`, payload);
    if (event !== 'backup-selector:load') return;
    const state = getE2eState();
    if (state.selectedBackupPaths.length > 0 && state.servers[0]) {
      await emitAppEvent('backup-selector:apply', {
        serverPath: state.servers[0].path,
        paths: state.selectedBackupPaths,
      });
    }
  }
}

export function getCurrentWebviewWindow() {
  return new WebviewWindow('main');
}
