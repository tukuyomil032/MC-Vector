import { describe, expect, it } from 'vitest';
import { generateProxyConfig } from '../proxy-commands';
import type { ProxyNetworkConfig } from '../proxy-commands';

const twoServers: ProxyNetworkConfig['servers'] = [
  { name: 'lobby', address: '127.0.0.1', port: 25566 },
  { name: 'survival', address: '127.0.0.1', port: 25567 },
];

describe('generateProxyConfig', () => {
  describe('velocity', () => {
    it('generates bind line with correct port', () => {
      const result = generateProxyConfig({ proxyType: 'velocity', proxyPort: 25565, servers: [] });
      expect(result).toContain('bind = "0.0.0.0:25565"');
    });

    it('generates [servers] section with each server entry', () => {
      const result = generateProxyConfig({
        proxyType: 'velocity',
        proxyPort: 25565,
        servers: twoServers,
      });
      expect(result).toContain('[servers]');
      expect(result).toContain('  lobby = "127.0.0.1:25566"');
      expect(result).toContain('  survival = "127.0.0.1:25567"');
    });

    it('generates try array listing all server names', () => {
      const result = generateProxyConfig({
        proxyType: 'velocity',
        proxyPort: 25565,
        servers: twoServers,
      });
      expect(result).toContain('try = ["lobby", "survival"]');
    });

    it('omits try line when servers array is empty', () => {
      const result = generateProxyConfig({ proxyType: 'velocity', proxyPort: 25565, servers: [] });
      expect(result).not.toContain('try =');
    });

    it('includes [advanced] section', () => {
      const result = generateProxyConfig({ proxyType: 'velocity', proxyPort: 25565, servers: [] });
      expect(result).toContain('[advanced]');
      expect(result).toContain('compression-threshold = 256');
    });
  });

  describe('bungeecord / waterfall', () => {
    it('generates listeners host with correct port for waterfall', () => {
      const result = generateProxyConfig({ proxyType: 'waterfall', proxyPort: 25565, servers: [] });
      expect(result).toContain('- host: 0.0.0.0:25565');
    });

    it('generates listeners host with correct port for bungeecord', () => {
      const result = generateProxyConfig({
        proxyType: 'bungeecord',
        proxyPort: 19132,
        servers: [],
      });
      expect(result).toContain('- host: 0.0.0.0:19132');
    });

    it('generates servers section with address and restricted flag', () => {
      const result = generateProxyConfig({
        proxyType: 'waterfall',
        proxyPort: 25565,
        servers: [{ name: 'lobby', address: '127.0.0.1', port: 25566, restricted: true }],
      });
      expect(result).toContain('  lobby:');
      expect(result).toContain('    address: 127.0.0.1:25566');
      expect(result).toContain('    restricted: true');
    });

    it('sets restricted: false when restricted is not set', () => {
      const result = generateProxyConfig({
        proxyType: 'waterfall',
        proxyPort: 25565,
        servers: [{ name: 'lobby', address: '127.0.0.1', port: 25566 }],
      });
      expect(result).toContain('    restricted: false');
    });

    it('uses server name as fallback motd when motd is not provided', () => {
      const result = generateProxyConfig({
        proxyType: 'waterfall',
        proxyPort: 25565,
        servers: [{ name: 'lobby', address: '127.0.0.1', port: 25566 }],
      });
      expect(result).toContain('    motd: "lobby"');
    });

    it('uses provided motd when given', () => {
      const result = generateProxyConfig({
        proxyType: 'waterfall',
        proxyPort: 25565,
        servers: [{ name: 'lobby', address: '127.0.0.1', port: 25566, motd: 'Welcome!' }],
      });
      expect(result).toContain('    motd: "Welcome!"');
    });

    it('lists server names in priorities section', () => {
      const result = generateProxyConfig({
        proxyType: 'waterfall',
        proxyPort: 25565,
        servers: twoServers,
      });
      expect(result).toContain('  - lobby');
      expect(result).toContain('  - survival');
    });
  });

  describe('unknown proxy type', () => {
    it('returns empty string for an unsupported proxy type', () => {
      const result = generateProxyConfig({ proxyType: 'traefik', proxyPort: 25565, servers: [] });
      expect(result).toBe('');
    });
  });
});
