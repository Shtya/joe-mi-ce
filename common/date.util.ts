/**
 * Timezone-aware date utilities for the app.
 * All times are formatted in Africa/Cairo (UTC+2) for Egypt local time.
 */

const TIMEZONE = 'Africa/Cairo';

/**
 * Convert a Date (or ISO string) to a local ISO string with +02:00 offset.
 * Returns null if the value is null/undefined.
 * e.g. "2026-02-23T17:27:33.127Z" → "2026-02-23T19:27:33.000+02:00"
 */
export function toLocalISOString(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;

  // Format in Africa/Cairo timezone
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '00';

  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hour = get('hour');
  const minute = get('minute');
  const second = get('second');

  return `${year}-${month}-${day}T${hour}:${minute}:${second}+02:00`;
}

/**
 * Format a Date to local HH:mm string in Africa/Cairo timezone.
 * Returns null if the value is null/undefined.
 * e.g. "2026-02-23T17:27:33.127Z" → "19:27"
 */
export function toLocalTimeString(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;

  return d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIMEZONE,
  });
}

/**
 * Split a Date into separate local date and time strings.
 * Returns { date: 'YYYY-MM-DD', time: 'HH:mm:ss' } in Africa/Cairo timezone.
 */
export function splitLocalDateTime(date: Date | string | null | undefined): { date: string; time: string } {
  if (!date) return { date: '-', time: '-' };
  const d = new Date(date);
  if (isNaN(d.getTime())) return { date: '-', time: '-' };

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '00';

  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}:${get('second')}`,
  };
}
