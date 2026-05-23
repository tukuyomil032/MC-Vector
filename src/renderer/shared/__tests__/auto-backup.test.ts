import { describe, expect, it } from 'vitest';
import {
  buildAutoBackupName,
  buildTimeBasedAutoBackupKey,
  resolveAutoBackupScheduleType,
} from '../auto-backup';
import type { MinecraftServer } from '../server declaration';

function makeServer(overrides: Partial<MinecraftServer> = {}): MinecraftServer {
  return {
    id: 'srv-1',
    name: 'TestServer',
    softwareType: 'paper',
    minecraftVersion: '1.21.1',
    port: 25565,
    memory: 2048,
    javaPath: '/usr/bin/java',
    serverPath: '/servers/test',
    jarFile: 'server.jar',
    status: 'stopped',
    ...overrides,
  } as MinecraftServer;
}

describe('resolveAutoBackupScheduleType', () => {
  it('returns "interval" when autoBackupScheduleType is not set', () => {
    expect(resolveAutoBackupScheduleType(makeServer())).toBe('interval');
  });

  it('returns "interval" for an unknown value', () => {
    expect(resolveAutoBackupScheduleType(makeServer({ autoBackupScheduleType: undefined }))).toBe(
      'interval',
    );
  });

  it('returns "daily" when set to "daily"', () => {
    expect(resolveAutoBackupScheduleType(makeServer({ autoBackupScheduleType: 'daily' }))).toBe(
      'daily',
    );
  });

  it('returns "weekly" when set to "weekly"', () => {
    expect(resolveAutoBackupScheduleType(makeServer({ autoBackupScheduleType: 'weekly' }))).toBe(
      'weekly',
    );
  });

  it('returns "interval" when explicitly set to "interval"', () => {
    expect(resolveAutoBackupScheduleType(makeServer({ autoBackupScheduleType: 'interval' }))).toBe(
      'interval',
    );
  });
});

describe('buildTimeBasedAutoBackupKey', () => {
  it('returns null for interval schedule type', () => {
    const now = new Date(2025, 4, 23, 3, 0, 0);
    const server = makeServer({ autoBackupScheduleType: 'interval' });
    expect(buildTimeBasedAutoBackupKey(server, now)).toBeNull();
  });

  it('returns null when current time does not match target for daily', () => {
    const now = new Date(2025, 4, 23, 10, 0, 0);
    const server = makeServer({ autoBackupScheduleType: 'daily', autoBackupTime: '03:00' });
    expect(buildTimeBasedAutoBackupKey(server, now)).toBeNull();
  });

  it('returns a key string when time matches for daily', () => {
    const now = new Date(2025, 4, 23, 3, 0, 0);
    const server = makeServer({ autoBackupScheduleType: 'daily', autoBackupTime: '03:00' });
    expect(buildTimeBasedAutoBackupKey(server, now)).toBe('daily-2025-05-23-03-00');
  });

  it('returns null for weekly when weekday does not match', () => {
    // 2025-05-23 is a Friday (day=5), target weekday=0 (Sunday)
    const now = new Date(2025, 4, 23, 3, 0, 0);
    const server = makeServer({
      autoBackupScheduleType: 'weekly',
      autoBackupTime: '03:00',
      autoBackupWeekday: 0,
    });
    expect(buildTimeBasedAutoBackupKey(server, now)).toBeNull();
  });

  it('returns a key string for weekly when time and weekday both match', () => {
    // 2025-05-25 is a Sunday (day=0)
    const now = new Date(2025, 4, 25, 3, 0, 0);
    const server = makeServer({
      autoBackupScheduleType: 'weekly',
      autoBackupTime: '03:00',
      autoBackupWeekday: 0,
    });
    expect(buildTimeBasedAutoBackupKey(server, now)).toBe('weekly-2025-05-25-03-00');
  });

  it('falls back to 03:00 when autoBackupTime is invalid', () => {
    const now = new Date(2025, 4, 23, 3, 0, 0);
    const server = makeServer({ autoBackupScheduleType: 'daily', autoBackupTime: 'bad' });
    expect(buildTimeBasedAutoBackupKey(server, now)).toBe('daily-2025-05-23-03-00');
  });
});

describe('buildAutoBackupName', () => {
  it('generates filename with server name and formatted datetime', () => {
    const now = new Date(2025, 4, 23, 14, 30, 59);
    const server = makeServer({ name: 'MySurvival' });
    expect(buildAutoBackupName(server, now)).toBe('AutoBackup MySurvival 2025-05-23-14-30-59.zip');
  });

  it('pads single-digit month, day, hour, minute, second with zero', () => {
    const now = new Date(2025, 0, 5, 3, 7, 9);
    const server = makeServer({ name: 'S' });
    expect(buildAutoBackupName(server, now)).toBe('AutoBackup S 2025-01-05-03-07-09.zip');
  });
});
