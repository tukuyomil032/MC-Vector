import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Tauri HTTP capability scopes', () => {
  it('allows the official JAR metadata APIs', () => {
    const capability = JSON.parse(
      readFileSync(resolve(process.cwd(), 'src-tauri/capabilities/default.json'), 'utf8'),
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
});
