export function getCurrentWindow() {
  return {
    label: 'main',
    listen: async (_event: string, _handler: unknown) => () => {},
    once: async (_event: string, _handler: unknown) => () => {},
    emit: async (_event: string, _payload?: unknown) => {},
    show: async () => {},
    hide: async () => {},
    close: async () => {},
    setFocus: async () => {},
    minimize: async () => {},
    maximize: async () => {},
    unmaximize: async () => {},
    toggleMaximize: async () => {},
    isMaximized: async () => false,
    isMinimized: async () => false,
    isVisible: async () => true,
    isFocused: async () => true,
    setTitle: async (_title: string) => {},
    setFullscreen: async (_full: boolean) => {},
    isFullscreen: async () => false,
    theme: async () => 'dark',
    onThemeChanged: async (_handler: unknown) => () => {},
    // The UI reference captures replay the close request through the stored handler (quit confirmation).
    onCloseRequested: async (handler: unknown) => {
      const target = window as Window & { __closeRequestedHandler?: unknown };
      target.__closeRequestedHandler = handler;
      return () => {
        if (target.__closeRequestedHandler === handler) delete target.__closeRequestedHandler;
      };
    },
    // The UI reference captures replay OS drag events through the stored handler. Nothing else reads it.
    onDragDropEvent: async (handler: unknown) => {
      const target = window as Window & { __dragDropHandler?: unknown };
      target.__dragDropHandler = handler;
      // Remove only this registration: an effect re-run can register a newer handler before this one disposes.
      return () => {
        if (target.__dragDropHandler === handler) delete target.__dragDropHandler;
      };
    },
    onFocusChanged: async (_handler: unknown) => () => {},
    onScaleChanged: async (_handler: unknown) => () => {},
    setResizable: async (_val: boolean) => {},
    setDecorations: async (_val: boolean) => {},
    center: async () => {},
  };
}
