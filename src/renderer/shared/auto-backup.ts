import type { MinecraftServer } from './server declaration';

export type AutoBackupScheduleType = 'interval' | 'daily' | 'weekly';

export function resolveAutoBackupScheduleType(server: MinecraftServer): AutoBackupScheduleType {
  if (server.autoBackupScheduleType === 'daily' || server.autoBackupScheduleType === 'weekly') {
    return server.autoBackupScheduleType;
  }
  return 'interval';
}

function resolveAutoBackupTime(server: MinecraftServer): string {
  const raw = typeof server.autoBackupTime === 'string' ? server.autoBackupTime.trim() : '';
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(raw) ? raw : '03:00';
}

function resolveAutoBackupWeekday(server: MinecraftServer): number {
  const raw =
    typeof server.autoBackupWeekday === 'number' && Number.isFinite(server.autoBackupWeekday)
      ? Math.floor(server.autoBackupWeekday)
      : 0;
  return Math.min(6, Math.max(0, raw));
}

export function buildTimeBasedAutoBackupKey(server: MinecraftServer, now: Date): string | null {
  const scheduleType = resolveAutoBackupScheduleType(server);
  if (scheduleType === 'interval') {
    return null;
  }

  const [hourText, minuteText] = resolveAutoBackupTime(server).split(':');
  const targetHour = Number(hourText);
  const targetMinute = Number(minuteText);

  if (now.getHours() !== targetHour || now.getMinutes() !== targetMinute) {
    return null;
  }

  if (scheduleType === 'weekly') {
    const targetWeekday = resolveAutoBackupWeekday(server);
    if (now.getDay() !== targetWeekday) {
      return null;
    }
  }

  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${scheduleType}-${yyyy}-${mm}-${dd}-${hourText}-${minuteText}`;
}

export function buildAutoBackupName(server: MinecraftServer, now = new Date()): string {
  const yyyy = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const second = String(now.getSeconds()).padStart(2, '0');
  return `AutoBackup ${server.name} ${yyyy}-${month}-${day}-${hour}-${minute}-${second}.zip`;
}
