export const selectors = {
  appRoot: "[data-testid='app-root']",
  createServerButton: "[data-testid='create-server-button']",
  serverNameInput: "[data-testid='server-name-input']",
  serverPortInput: "[data-testid='server-port-input']",
  serverMemoryInput: "[data-testid='server-memory-input']",
  saveServerButton: "[data-testid='save-server-button']",
  serverList: "[data-testid='server-list']",
  serverCard: (serverId: string) => `[data-testid='server-card-${serverId}']`,
  deleteServerButton: (serverId: string) =>
    `[data-testid='delete-server-${serverId}']`,
} as const;
