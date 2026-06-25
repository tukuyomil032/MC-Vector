import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const setMock = vi.fn();
const saveMock = vi.fn();

vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn().mockResolvedValue({
    get: getMock,
    set: setMock,
    save: saveMock,
  }),
}));

vi.mock('../tauri-api', () => ({
  tauriInvoke: vi.fn(),
  tauriListen: vi.fn(),
}));

const SERVER_BASE = {
  version: '1.21',
  software: 'paper',
  port: 25565,
  memory: 2048,
  path: '/servers/s1',
  status: 'offline' as const,
};

describe('server-commands (CRUD)', () => {
  beforeEach(() => {
    vi.resetModules();
    getMock.mockReset();
    setMock.mockReset();
    saveMock.mockReset();
  });

  describe('getServers', () => {
    it('returns empty array when store is empty', async () => {
      getMock.mockResolvedValueOnce(null);
      const { getServers } = await import('../server-commands');
      const result = await getServers();
      expect(result).toEqual([]);
    });

    it('returns server array from store', async () => {
      const servers = [{ id: 's1', name: 'Test', ...SERVER_BASE }];
      getMock.mockResolvedValueOnce(servers);
      const { getServers } = await import('../server-commands');
      const result = await getServers();
      expect(result).toEqual(servers);
    });
  });

  describe('addServer', () => {
    it('appends server to existing list and saves', async () => {
      const existing = [{ id: 's1', name: 'Existing', ...SERVER_BASE }];
      const newServer = { id: 's2', name: 'New', ...SERVER_BASE, port: 25566 };
      getMock.mockResolvedValueOnce(existing);
      const { addServer } = await import('../server-commands');
      await addServer(newServer);
      // existing is mutated by push, so assert with explicit array
      expect(setMock).toHaveBeenCalledWith('servers', [
        { id: 's1', name: 'Existing', ...SERVER_BASE },
        newServer,
      ]);
      expect(saveMock).toHaveBeenCalled();
    });

    it('returns the added server', async () => {
      getMock.mockResolvedValueOnce(null);
      const server = { id: 's1', name: 'Test', ...SERVER_BASE };
      const { addServer } = await import('../server-commands');
      const result = await addServer(server);
      expect(result).toBe(server);
    });
  });

  describe('updateServer', () => {
    it('replaces matching server by id and saves', async () => {
      const servers = [{ id: 's1', name: 'Old Name', ...SERVER_BASE }];
      getMock.mockResolvedValueOnce(servers);
      const updated = { ...servers[0], name: 'New Name' };
      const { updateServer } = await import('../server-commands');
      await updateServer(updated);
      expect(setMock).toHaveBeenCalledWith('servers', [updated]);
      expect(saveMock).toHaveBeenCalled();
    });

    it('does not save when id is not found', async () => {
      getMock.mockResolvedValueOnce([]);
      const { updateServer } = await import('../server-commands');
      await updateServer({ id: 'nonexistent', name: 'X', ...SERVER_BASE });
      expect(setMock).not.toHaveBeenCalled();
      expect(saveMock).not.toHaveBeenCalled();
    });
  });

  describe('deleteServer', () => {
    it('removes server by id and saves', async () => {
      const servers = [
        { id: 's1', name: 'A', ...SERVER_BASE },
        { id: 's2', name: 'B', ...SERVER_BASE, port: 25566 },
      ];
      getMock.mockResolvedValueOnce(servers);
      const { deleteServer } = await import('../server-commands');
      const result = await deleteServer('s1');
      expect(setMock).toHaveBeenCalledWith('servers', [servers[1]]);
      expect(saveMock).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });

  describe('getServerTemplates', () => {
    it('returns empty array when store is empty', async () => {
      getMock.mockResolvedValueOnce(null);
      const { getServerTemplates } = await import('../server-commands');
      const result = await getServerTemplates();
      expect(result).toEqual([]);
    });

    it('returns templates from store', async () => {
      const templates = [
        {
          id: 't1',
          name: 'Template',
          version: '1.21',
          software: 'paper',
          port: 25565,
          memory: 2048,
        },
      ];
      getMock.mockResolvedValueOnce(templates);
      const { getServerTemplates } = await import('../server-commands');
      const result = await getServerTemplates();
      expect(result).toEqual(templates);
    });
  });

  describe('saveServerTemplate', () => {
    it('appends new template and saves', async () => {
      getMock.mockResolvedValueOnce([]);
      const template = {
        id: 't1',
        name: 'My Template',
        version: '1.21',
        software: 'paper',
        port: 25565,
        memory: 2048,
      };
      const { saveServerTemplate } = await import('../server-commands');
      const result = await saveServerTemplate(template);
      expect(setMock).toHaveBeenCalledWith('serverTemplates', [template]);
      expect(saveMock).toHaveBeenCalled();
      expect(result).toEqual(template);
    });

    it('updates existing template by id', async () => {
      const existing = [
        { id: 't1', name: 'Old', version: '1.21', software: 'paper', port: 25565, memory: 2048 },
      ];
      getMock.mockResolvedValueOnce(existing);
      const updated = { ...existing[0], name: 'Updated' };
      const { saveServerTemplate } = await import('../server-commands');
      await saveServerTemplate(updated);
      expect(setMock).toHaveBeenCalledWith('serverTemplates', [updated]);
    });
  });

  describe('deleteServerTemplate', () => {
    it('removes template by id and saves', async () => {
      const templates = [
        { id: 't1', name: 'A', version: '1.21', software: 'paper', port: 25565, memory: 2048 },
        { id: 't2', name: 'B', version: '1.21', software: 'paper', port: 25566, memory: 2048 },
      ];
      getMock.mockResolvedValueOnce(templates);
      const { deleteServerTemplate } = await import('../server-commands');
      await deleteServerTemplate('t1');
      expect(setMock).toHaveBeenCalledWith('serverTemplates', [templates[1]]);
      expect(saveMock).toHaveBeenCalled();
    });
  });
});
