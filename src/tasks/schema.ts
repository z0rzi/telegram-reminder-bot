/**
 * Reminder kinds for a task
 */
export type ReminderKind = "dayBefore2100" | "oneHourBefore" | "atTime";

/**
 * Individual reminder for a task
 */
export type Reminder = {
  kind: ReminderKind;
  atIso: string; // ISO string representing the reminder instant
  sentAtIso?: string; // set when actually sent
  skippedReason?: string; // e.g. "past" if not scheduled
};

/**
 * Task status
 */
export type TaskStatus = "scheduled" | "cancelled" | "done";

/**
 * A task definition
 */
export type Task = {
  id: string; // stable identifier
  chatId: number; // Telegram chat id for sending reminders
  message: string; // what to remind
  dueAtIso: string; // ISO string for the intended task datetime
  createdAtIso: string;
  updatedAtIso: string;
  status: TaskStatus;
  reminders: Reminder[]; // 3 reminders planned
};

/**
 * The tasks file structure
 */
export type TasksFile = {
  version: number;
  timezone: "Europe/Paris";
  tasks: Task[];
};

export const CURRENT_TASKS_VERSION = 1;
