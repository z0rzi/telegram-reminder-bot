import { DateTime } from "luxon";

export const TIMEZONE = "Europe/Paris";

/**
 * Gets the current time in Europe/Paris timezone as ISO string.
 */
export function getNowParis(): DateTime {
  return DateTime.now().setZone(TIMEZONE);
}

/**
 * Gets the current UTC time as ISO string.
 */
export function getNowUtc(): string {
  return new Date().toISOString();
}

/**
 * Formats an ISO datetime for display in Europe/Paris.
 * Shows: weekday, dd/mm/yyyy HH:mm
 */
export function formatForUser(isoString: string): string {
  const dt = DateTime.fromISO(isoString).setZone(TIMEZONE);

  const weekday = dt.toFormat("cccc"); // full weekday name
  const date = dt.toFormat("dd/MM/yyyy");
  const time = dt.toFormat("HH:mm");

  return `${weekday} ${date} ${time}`;
}

/**
 * Formats an ISO datetime without the year.
 * Shows: dd/MM HH:mm
 */
export function formatForUserNoYear(isoString: string): string {
  const now = getNowParis();
  const dt = DateTime.fromISO(isoString).setZone(TIMEZONE);
  const time = dt.toFormat("HH:mm");

  if (dt.hasSame(now, "day")) {
    return `today ${time}`;
  }

  const tomorrow = now.plus({ days: 1 });
  if (dt.hasSame(tomorrow, "day")) {
    return `tomorrow ${time}`;
  }

  const weekday = dt.toFormat("ccc");
  const date = dt.toFormat("dd/MM");
  return `${weekday} ${date} ${time}`;
}

/**
 * Formats an ISO datetime for display with relative terms (today/tomorrow).
 * - If due date is the same local day as now (Europe/Paris) => "today at HH:mm"
 * - If due date is the next local day => "tomorrow at HH:mm"
 * - Otherwise => "on weekday dd/MM/yyyy at HH:mm"
 */
export function formatForUserRelative(isoString: string): string {
  const now = getNowParis();
  const dt = DateTime.fromISO(isoString).setZone(TIMEZONE);

  const time = dt.toFormat("HH:mm");

  // Check if same day
  if (dt.hasSame(now, "day")) {
    return `today at ${time}`;
  }

  // Check if next day
  const tomorrow = now.plus({ days: 1 });
  if (dt.hasSame(tomorrow, "day")) {
    return `tomorrow at ${time}`;
  }

  // Full date format for other days
  const weekday = dt.toFormat("cccc"); // full weekday name
  const date = dt.toFormat("dd/MM/yyyy");

  return `on ${weekday} ${date} at ${time}`;
}

/**
 * Formats just the time portion (HH:mm) in Europe/Paris.
 */
export function formatTimeOnly(isoString: string): string {
  const dt = DateTime.fromISO(isoString).setZone(TIMEZONE);
  return dt.toFormat("HH:mm");
}

/**
 * Formats just the date portion (dd/mm/yyyy) in Europe/Paris.
 */
export function formatDateOnly(isoString: string): string {
  const dt = DateTime.fromISO(isoString).setZone(TIMEZONE);
  return dt.toFormat("dd/MM/yyyy");
}

/**
 * Converts an ISO string to a DateTime in Europe/Paris.
 */
export function toParisDateTime(isoString: string): DateTime {
  return DateTime.fromISO(isoString).setZone(TIMEZONE);
}

/**
 * Checks if an ISO datetime is in the past.
 */
export function isPast(isoString: string): boolean {
  const dt = DateTime.fromISO(isoString);
  return dt.toMillis() < Date.now();
}

/**
 * Computes the milliseconds delay until a future ISO datetime.
 * Returns 0 or negative if the time is in the past.
 */
export function getDelayMs(isoString: string): number {
  const targetMs = DateTime.fromISO(isoString).toMillis();
  return targetMs - Date.now();
}
