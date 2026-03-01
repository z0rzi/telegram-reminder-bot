import { DateTime } from "luxon";
import { type Reminder, type ReminderKind } from "./schema";
import { TIMEZONE } from "./time";

/**
 * Computes the reminder instants for a given due time.
 * - oneHourBefore: due time minus 1 hour
 * - atTime: the exact due time
 */
export function computeReminders(dueAtIso: string): Reminder[] {
  const dueDt = DateTime.fromISO(dueAtIso).setZone(TIMEZONE);

  // 1 hour before
  const oneHourBefore = dueDt.minus({ hours: 1 });

  // At the exact time
  const atTime = dueDt;

  return [
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
    case "oneHourBefore":
      return "1 hour before";
    case "atTime":
      return "at the time";
  }
}
