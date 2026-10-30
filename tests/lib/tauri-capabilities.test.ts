import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ALLOWED_TAURI_COMMANDS } from '@/lib/tauri-command-allowlist';
import { describe, expect, it } from 'vitest';

describe('Tauri HTTP capability scopes', () => {
  it('exposes the managed delete and serialized restart commands only', () => {
    const handler = readFileSync(resolve(process.cwd(), 'src-tauri/src/lib.rs'), 'utf8');
    expect(handler).not.toContain('commands::server_registry::delete_server,');
    expect(handler).toContain('commands::server_lifecycle::delete_managed_server,');
    expect(handler).toContain('commands::server::restart_server,');
    expect(ALLOWED_TAURI_COMMANDS.has('delete_server')).toBe(false);
    expect(ALLOWED_TAURI_COMMANDS.has('restart_server')).toBe(true);
  });
  it('allows the official JAR metadata APIs', () => {
    const capability = JSON.parse(
      readFileSync(
        resolve(process.cwd(), 'src-tauri/capabilities/main-artifact-install.json'),
        'utf8',
      ),
    ) as { permissions: unknown[] };
    const httpPermission = capability.permissions.find(
      (permission): permission is { identifier: string; allow: Array<{ url: string }> } =>
        typeof permission === 'object' &&
        permission !== null &&
        'identifier' in permission &&
        permission.identifier === 'http:default',
    );

    expect(httpPermission?.allow.map((entry) => entry.url)).toEqual(
      expect.arrayContaining(['https://fill.papermc.io/**', 'https://api.leafmc.one/**']),
    );
  });

  it('keeps backup selector permissions free of process, store, updater, and HTTP access', () => {
    const capability = JSON.parse(
      readFileSync(resolve(process.cwd(), 'src-tauri/capabilities/backup-selector.json'), 'utf8'),
    ) as { permissions: unknown[] };
    const permissions = capability.permissions.filter(
      (permission): permission is string => typeof permission === 'string',
    );

    expect(permissions).not.toEqual(expect.arrayContaining(['process:default', 'store:default']));
    expect(permissions.some((permission) => permission.startsWith('updater:'))).toBe(false);
    expect(capability.permissions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ identifier: 'http:default' })]),
    );
  });

  it('does not ship wildcard localhost or websocket CSP sources', () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), 'src-tauri/tauri.conf.json'), 'utf8'),
    ) as { app: { security: { csp: string } } };
    expect(config.app.security.csp).not.toContain('localhost:*');
    expect(config.app.security.csp).not.toContain('ws://localhost');
    const directives = config.app.security.csp.split(';').map((directive) => directive.trim());
    expect(directives.find((directive) => directive.startsWith('img-src '))).not.toMatch(
      /\shttps:(?:\s|$)/,
    );
    expect(directives.find((directive) => directive.startsWith('connect-src '))).not.toMatch(
      /\shttps:(?:\s|$)/,
    );
    expect(config.app.security.csp).toContain('https://api.modrinth.com');
  });
});
