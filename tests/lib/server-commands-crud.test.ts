import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauriInvokeMock = vi.fn();

vi.mock('@/lib/tauri-api', () => ({
  tauriInvoke: tauriInvokeMock,
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

describe('server-commands', () => {
  beforeEach(() => {
    vi.resetModules();
    tauriInvokeMock.mockReset();
    tauriInvokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_servers') {
        return [];
      }
      if (cmd === 'is_server_running') {
        return false;
      }
      if (cmd === 'delete_managed_server') {
        return true;
      }
      return undefined;
    });
  });

  describe('getServers', () => {
    it('returns empty array when store is empty', async () => {
      tauriInvokeMock.mockResolvedValueOnce([]);
      const { getServers } = await import('@/lib/server-commands');
      const result = await getServers();
      expect(result).toEqual([]);
      expect(tauriInvokeMock).toHaveBeenCalledWith('get_servers');
    });

    it('returns server array from Rust registry', async () => {
      const servers = [{ id: 's1', name: 'Test', ...SERVER_BASE }];
      tauriInvokeMock.mockResolvedValueOnce(servers);
      const { getServers } = await import('@/lib/server-commands');
      const result = await getServers();
      expect(result).toEqual(servers);
    });

    it('returns the Rust-owned path and performs no renderer-side migration writes', async () => {
      const legacy = {
        id: 's1',
        name: 'Test',
        ...SERVER_BASE,
        path: '/app-data/servers/legacy-name',
      };
      tauriInvokeMock.mockResolvedValueOnce([legacy]);

      const { getServers } = await import('@/lib/server-commands');
      const result = await getServers();

      expect(result[0].path).toBe('/app-data/servers/legacy-name');
      expect(tauriInvokeMock).toHaveBeenCalledTimes(1);
      expect(tauriInvokeMock).toHaveBeenCalledWith('get_servers');
    });
  });

  describe('updateServer', () => {
    it('sends updated server data to the Rust registry command', async () => {
      const updated = { id: 's1', name: 'New Name', ...SERVER_BASE };
      const { updateServer } = await import('@/lib/server-commands');
      await updateServer(updated);
      expect(tauriInvokeMock).toHaveBeenCalledWith('update_server', { server: updated });
    });
  });

  describe('deleteServer', () => {
    it('delegates deletion to the atomic Rust lifecycle command', async () => {
      const { deleteServer } = await import('@/lib/server-commands');
      const result = await deleteServer('s1');
      expect(result).toBe(true);
      expect(tauriInvokeMock).toHaveBeenCalledTimes(1);
      expect(tauriInvokeMock).toHaveBeenCalledWith('delete_managed_server', { serverId: 's1' });
    });

    it('propagates a refusal to delete a running server from Rust', async () => {
      tauriInvokeMock.mockRejectedValueOnce(new Error('Cannot delete a running server'));
      const { deleteServer } = await import('@/lib/server-commands');

      await expect(deleteServer('s1')).rejects.toThrow('Cannot delete a running server');
      expect(tauriInvokeMock).toHaveBeenCalledTimes(1);
      expect(tauriInvokeMock).toHaveBeenCalledWith('delete_managed_server', { serverId: 's1' });
    });
  });

  describe('getServerTemplates', () => {
    it('returns empty array when store is empty', async () => {
      tauriInvokeMock.mockResolvedValueOnce([]);
      const { getServerTemplates } = await import('@/lib/server-commands');
      const result = await getServerTemplates();
      expect(result).toEqual([]);
      expect(tauriInvokeMock).toHaveBeenCalledWith('get_server_templates');
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
      tauriInvokeMock.mockResolvedValueOnce(templates);
      const { getServerTemplates } = await import('@/lib/server-commands');
      const result = await getServerTemplates();
      expect(result).toEqual(templates);
    });
  });

  describe('saveServerTemplate', () => {
    it('saves new template through the Rust registry command', async () => {
      const template = {
        id: 't1',
        name: 'My Template',
        version: '1.21',
        software: 'paper',
        port: 25565,
        memory: 2048,
      };
      const { saveServerTemplate } = await import('@/lib/server-commands');
      const result = await saveServerTemplate(template);
      expect(tauriInvokeMock).toHaveBeenCalledWith('save_server_template', { template });
      expect(result).toEqual(template);
    });

    it('saves updated template through the Rust registry command', async () => {
      const updated = {
        id: 't1',
        name: 'Updated',
        version: '1.21',
        software: 'paper',
        port: 25565,
        memory: 2048,
      };
      const { saveServerTemplate } = await import('@/lib/server-commands');
      await saveServerTemplate(updated);
      expect(tauriInvokeMock).toHaveBeenCalledWith('save_server_template', { template: updated });
    });
  });

  describe('deleteServerTemplate', () => {
    it('deletes a template through the Rust registry command', async () => {
      const { deleteServerTemplate } = await import('@/lib/server-commands');
      await deleteServerTemplate('t1');
      expect(tauriInvokeMock).toHaveBeenCalledWith('delete_server_template', { templateId: 't1' });
    });
  });

  describe('startServer', () => {
    it('passes only the server ID to the Rust-owned start command', async () => {
      tauriInvokeMock.mockResolvedValueOnce(undefined);

      const { startServer } = await import('@/lib/server-commands');

      await startServer('server-1');

      expect(tauriInvokeMock).toHaveBeenCalledWith('start_server', {
        serverId: 'server-1',
      });
    });

    it('invokes the Rust-owned restart with only the server ID', async () => {
      tauriInvokeMock.mockResolvedValueOnce(undefined);

      const { restartServer } = await import('@/lib/server-commands');

      await restartServer('server-1');

      expect(tauriInvokeMock).toHaveBeenCalledWith('restart_server', {
        serverId: 'server-1',
      });
    });
  });

  describe('stopServer', () => {
    it('invokes stop_server with serverId', async () => {
      tauriInvokeMock.mockResolvedValueOnce(undefined);

      const { stopServer } = await import('@/lib/server-commands');

      await stopServer('server-1');

      expect(tauriInvokeMock).toHaveBeenCalledWith('stop_server', {
        serverId: 'server-1',
      });
    });
  });

  describe('sendCommand', () => {
    it('invokes send_command with serverId and command', async () => {
      tauriInvokeMock.mockResolvedValueOnce(undefined);

      const { sendCommand } = await import('@/lib/server-commands');

      await sendCommand('server-1', 'stop');

      expect(tauriInvokeMock).toHaveBeenCalledWith('send_command', {
        serverId: 'server-1',
        command: 'stop',
      });
    });
  });

  describe('isServerRunning', () => {
    it('invokes is_server_running and returns boolean', async () => {
      tauriInvokeMock.mockResolvedValueOnce(true);

      const { isServerRunning } = await import('@/lib/server-commands');

      const result = await isServerRunning('server-1');

      expect(tauriInvokeMock).toHaveBeenCalledWith('is_server_running', {
        serverId: 'server-1',
      });
      expect(result).toBe(true);
    });
  });
});
