/**
 * Timezone-aware date utilities.
 * Automatically uses the server's configured timezone (TZ environment variable).
 * Set TZ=Africa/Cairo on the server to get Egypt local time automatically.
 */

/**
 * UTC+2 offset in milliseconds (Egypt / Arabia Standard Time).
 * Hardcoded because Node.js reads TZ at startup — dotenv is too late to change it.
 */
const OFFSET_MS = 2 * 60 * 60 * 1000; // +02:00

function localOffsetMs(): number {
  return OFFSET_MS;
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
  // Keep Z suffix but value is local time — e.g. "2026-02-23T19:27:33.127Z"
  return local.toISOString();
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
