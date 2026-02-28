import { DateTime } from "luxon";
import { type Reminder, type ReminderKind } from "./schema";
import { TIMEZONE } from "./time";

/**
 * Computes the three reminder instants for a given due time.
 * - dayBefore2100: the day before at 21:00 Paris time
 * - oneHourBefore: due time minus 1 hour
 * - atTime: the exact due time
 */
export function computeReminders(dueAtIso: string): Reminder[] {
  const dueDt = DateTime.fromISO(dueAtIso).setZone(TIMEZONE);

  // Day before at 21:00
  const dayBefore2100 = dueDt.minus({ days: 1 }).set({
    hour: 21,
    minute: 0,
    second: 0,
    millisecond: 0,
  });

  // 1 hour before
  const oneHourBefore = dueDt.minus({ hours: 1 });

  // At the exact time
  const atTime = dueDt;

  return [
    {
      kind: "dayBefore2100",
      atIso: dayBefore2100.toUTC().toISO() as string,
    },
    {
      kind: "oneHourBefore",
      atIso: oneHourBefore.toUTC().toISO() as string,
    },
    {
      kind: "atTime",
      atIso: atTime.toUTC().toISO() as string,
    },
  ];
}

/**
 * Returns a human-readable label for a reminder kind.
 */
export function getReminderKindLabel(kind: ReminderKind): string {
  switch (kind) {
    case "dayBefore2100":
      return "day before at 21:00";
    case "oneHourBefore":
      return "1 hour before";
    case "atTime":
      return "at the time";
  }
}
