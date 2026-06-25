export class WebviewWindow {
  label: string;
  constructor(label: string, _options?: unknown) {
    this.label = label;
  }
  static getByLabel(_label: string): WebviewWindow | null {
    return null;
  }
  async listen(_event: string, _handler: unknown) {
    return () => {};
  }
  async show() {}
  async hide() {}
  async close() {}
  async setFocus() {}
}

export function getCurrentWebviewWindow() {
  return new WebviewWindow('main');
}
