/**
 * Timezone-aware date utilities.
 * All times are formatted in UTC+2 (Egypt local time).
 *
 * Uses a fixed +02:00 offset (no Intl timezone names)
 * to ensure compatibility with all Node.js builds.
 */

const OFFSET_MS = 2 * 60 * 60 * 1000; // UTC+2 in milliseconds

function shiftToLocal(date: Date): Date {
  return new Date(date.getTime() + OFFSET_MS);
}

/**
 * Convert a Date/ISO string to a local ISO string with +02:00 offset.
 * e.g. "2026-02-23T17:27:33.127Z" → "2026-02-23T19:27:33.000+02:00"
 */
export function toLocalISOString(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = new Date(date as any);
  if (isNaN(d.getTime())) return null;
  return shiftToLocal(d).toISOString().replace('Z', '+02:00');
}

/**
 * Format a Date to local HH:mm string in UTC+2.
 * e.g. "2026-02-23T17:27:33.127Z" → "19:27"
 */
export function toLocalTimeString(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = new Date(date as any);
  if (isNaN(d.getTime())) return null;
  const local = shiftToLocal(d);
  const h = String(local.getUTCHours()).padStart(2, '0');
  const m = String(local.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Split a Date into { date: 'YYYY-MM-DD', time: 'HH:mm:ss' } in UTC+2.
 */
export function splitLocalDateTime(date: Date | string | null | undefined): { date: string; time: string } {
  if (!date) return { date: '-', time: '-' };
  const d = new Date(date as any);
  if (isNaN(d.getTime())) return { date: '-', time: '-' };
  const local = shiftToLocal(d);
  const year  = local.getUTCFullYear();
  const month = String(local.getUTCMonth() + 1).padStart(2, '0');
  const day   = String(local.getUTCDate()).padStart(2, '0');
  const h     = String(local.getUTCHours()).padStart(2, '0');
  const m     = String(local.getUTCMinutes()).padStart(2, '0');
  const s     = String(local.getUTCSeconds()).padStart(2, '0');
  return { date: `${year}-${month}-${day}`, time: `${h}:${m}:${s}` };
}
