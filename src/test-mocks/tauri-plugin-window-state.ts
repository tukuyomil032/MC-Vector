export async function restoreStateCurrent(_flags?: number): Promise<void> {}

export async function saveWindowState(_flags?: number): Promise<void> {}

export const StateFlags = {
  ALL: 31,
  POSITION: 1,
  SIZE: 2,
  MAXIMIZED: 4,
  VISIBLE: 8,
  DECORATIONS: 16,
};
