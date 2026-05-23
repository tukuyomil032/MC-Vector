export const selectors = {
  // app shell structure
  appRoot: "[data-testid='app-root']",
  appSidebar: "[data-testid='app-sidebar']",
  appMain: "[data-testid='app-main']",
  appMainContent: "[data-testid='app-main-content']",
  appMainHeader: "[data-testid='app-main-header']",
  appSidebarNav: "[data-testid='app-sidebar-nav']",

  // navigation items (dynamic)
  navItem: (view: string) => `[data-testid='nav-item-${view}']`,

  // sidebar header
  sidebarBrandButton: "[data-testid='sidebar-brand-button']",
  sidebarToggleButton: "[data-testid='sidebar-toggle-button']",

  // server list & cards
  serverList: "[data-testid='server-list']",
  serverCard: (serverId: string) => `[data-testid='server-card-${serverId}']`,
  deleteServerButton: (serverId: string) =>
    `[data-testid='delete-server-${serverId}']`,
  createServerButton: "[data-testid='create-server-button']",

  // AddServerChoiceModal
  addServerChoiceModal: "[data-testid='add-server-choice-modal']",
  choiceNewServerButton: "[data-testid='choice-new-server-button']",
  choiceImportServerButton: "[data-testid='choice-import-server-button']",

  // AddServerModal form
  addServerModal: "[data-testid='add-server-modal']",
  serverNameInput: "[data-testid='server-name-input']",
  serverPortInput: "[data-testid='server-port-input']",
  serverMemoryInput: "[data-testid='server-memory-input']",
  saveServerButton: "[data-testid='save-server-button']",
  cancelServerButton: "[data-testid='cancel-server-button']",

  // header action buttons
  serverStartButton: "[data-testid='server-start-button']",
  serverRestartButton: "[data-testid='server-restart-button']",
  serverStopButton: "[data-testid='server-stop-button']",

  // PluginBrowser
  pluginBrowser: "[data-testid='plugin-browser']",
  pluginSearchInput: "[data-testid='plugin-search-input']",

  // SettingsWindow
  settingsWindow: "[data-testid='settings-window']",
} as const;
