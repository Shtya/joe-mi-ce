/**
 * Timezone-aware date utilities.
 * Automatically uses the server's configured timezone (TZ environment variable).
 * Set TZ=Africa/Cairo on the server to get Egypt local time automatically.
 */

/**
 * Get the server's current UTC offset in milliseconds.
 * This reads automatically from the server's TZ env/system timezone.
 * e.g. if TZ=Africa/Cairo (UTC+2), returns 7200000
 */
function localOffsetMs(): number {
  return -new Date().getTimezoneOffset() * 60 * 1000;
}

/**
 * Get the server's timezone offset as "+HH:MM" or "-HH:MM" string.
 * e.g. UTC+2 → "+02:00"
 */
function localOffsetStr(): string {
  const totalMinutes = -new Date().getTimezoneOffset();
  const sign = totalMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(totalMinutes);
  const h = String(Math.floor(abs / 60)).padStart(2, '0');
  const m = String(abs % 60).padStart(2, '0');
  return `${sign}${h}:${m}`;
}

/**
 * Convert a UTC Date/ISO string to a local ISO string with the server's timezone offset.
 * e.g. "2026-02-23T17:27:33.127Z" with TZ=Africa/Cairo → "2026-02-23T19:27:33.000+02:00"
 */
export function toLocalISOString(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = new Date(date as any);
  if (isNaN(d.getTime())) return null;
  const local = new Date(d.getTime() + localOffsetMs());
  return local.toISOString().replace('Z', localOffsetStr());
}

/**
 * Format a Date to local HH:mm string using the server's timezone.
 * e.g. "2026-02-23T17:27:33.127Z" with TZ=Africa/Cairo → "19:27"
 */
export function toLocalTimeString(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = new Date(date as any);
  if (isNaN(d.getTime())) return null;
  const local = new Date(d.getTime() + localOffsetMs());
  const h = String(local.getUTCHours()).padStart(2, '0');
  const m = String(local.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Split a Date into { date: 'YYYY-MM-DD', time: 'HH:mm:ss' } using the server's timezone.
 */
export function splitLocalDateTime(date: Date | string | null | undefined): { date: string; time: string } {
  if (!date) return { date: '-', time: '-' };
  const d = new Date(date as any);
  if (isNaN(d.getTime())) return { date: '-', time: '-' };
  const local = new Date(d.getTime() + localOffsetMs());
  const year  = local.getUTCFullYear();
  const month = String(local.getUTCMonth() + 1).padStart(2, '0');
  const day   = String(local.getUTCDate()).padStart(2, '0');
  const h     = String(local.getUTCHours()).padStart(2, '0');
  const m     = String(local.getUTCMinutes()).padStart(2, '0');
  const s     = String(local.getUTCSeconds()).padStart(2, '0');
  return { date: `${year}-${month}-${day}`, time: `${h}:${m}:${s}` };
}
