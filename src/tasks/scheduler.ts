import { DateTime } from "luxon";
import { type Task, type ReminderKind } from "./schema";
import {
  getDelayMs,
  getNowUtc,
  getNowParis,
  formatDateOnly,
  formatTimeOnly,
  toParisDateTime,
  TIMEZONE,
} from "./time";
import { markReminderSent, getTask, removeTask, cleanupOldRemindersAndTasks } from "./store";

// Maximum delay for setTimeout (24 hours to avoid 32-bit overflow)
const MAX_DELAY_MS = 1000 * 60 * 60 * 24;

/**
 * Interface for sending reminder messages.
 * Abstracts away Telegram-specific details.
 */
export interface ReminderSender {
  sendMessage(chatId: number, text: string): Promise<void>;
}

// In-memory registry of scheduled timeouts - single handle per (taskId, kind)
type ScheduledTimeout = {
  taskId: string;
  reminderKind: ReminderKind;
  handle: ReturnType<typeof setTimeout> | null;
  fireAtMs: number;
};

const scheduledTimeouts = new Map<string, ScheduledTimeout>();

let dailySummaryTimeout: ReturnType<typeof setTimeout> | null = null;

// Reference to reminder sender
let reminderSender: ReminderSender | null = null;

/**
 * Sets the reminder sender for sending messages.
 */
export function setReminderSender(sender: ReminderSender): void {
  reminderSender = sender;
}

/**
 * Gets the key for a scheduled timeout entry.
 */
function getTimeoutKey(taskId: string, kind: ReminderKind): string {
  return `${taskId}:${kind}`;
}

/**
 * Schedules a reminder using setTimeout with chunking for long delays.
 */
export function scheduleReminder(
  task: Task,
  reminderKind: ReminderKind,
  atIso: string,
): boolean {
  const delayMs = getDelayMs(atIso);

  // If already in the past, don't schedule
  if (delayMs <= 0) {
    console.log(
      `[Scheduler] Skipping past reminder: ${task.id} ${reminderKind}`,
    );
    return false;
  }

  const fireAtMs = Date.now() + delayMs;
  const key = getTimeoutKey(task.id, reminderKind);

  // Cancel any existing timeout for this task+kind
  const existing = scheduledTimeouts.get(key);
  if (existing?.handle) {
    clearTimeout(existing.handle);
  }

  const scheduleChunk = () => {
    const remainingMs = fireAtMs - Date.now();

    if (remainingMs <= 0) {
      // Time has arrived, send the reminder
      sendReminder(task.id, reminderKind);
      scheduledTimeouts.delete(key);
      return;
    }

    const timeoutMs = Math.min(remainingMs, MAX_DELAY_MS);
    const handle = setTimeout(scheduleChunk, timeoutMs);

    // Store/update the timeout (single handle per reminder)
    scheduledTimeouts.set(key, {
      taskId: task.id,
      reminderKind,
      handle,
      fireAtMs,
    });
  };

  // Start the timeout chain
  const handle = setTimeout(scheduleChunk, Math.min(delayMs, MAX_DELAY_MS));

  // Store the timeout (single handle per reminder)
  scheduledTimeouts.set(key, {
    taskId: task.id,
    reminderKind,
    handle,
    fireAtMs,
  });

  console.log(
    `[Scheduler] Scheduled ${task.id} ${reminderKind} in ${Math.round(delayMs / 1000 / 60)} minutes`,
  );
  return true;
}

/**
 * Sends a reminder message to the user.
 */
async function sendReminder(taskId: string, kind: ReminderKind) {
  if (!reminderSender) {
    console.error("[Scheduler] No reminder sender available");
    return;
  }

  // Reload task from store to check it's still valid
  const task = await getTask(taskId);
  if (!task) {
    console.log(`[Scheduler] Task ${taskId} not found, skipping reminder`);
    return;
  }

  // Check task status
  if (task.status !== "scheduled") {
    console.log(`[Scheduler] Task ${taskId} is ${task.status}, skipping reminder`);
    return;
  }

  // Find the reminder and check if already sent or skipped
  const reminder = task.reminders.find((r) => r.kind === kind);
  if (!reminder) {
    console.log(`[Scheduler] Reminder ${kind} not found for task ${taskId}`);
    return;
  }

  if (reminder.sentAtIso) {
    console.log(`[Scheduler] Reminder ${kind} already sent for task ${taskId}`);
    return;
  }

  if (reminder.skippedReason) {
    console.log(`[Scheduler] Reminder ${kind} was skipped (${reminder.skippedReason}) for task ${taskId}`);
    return;
  }

  // Grace window: only skip if more than 5 minutes late (handles edge cases like restart delays)
  const gracePeriodMs = 5 * 60 * 1000; // 5 minutes
  const delayMs = getDelayMs(reminder.atIso);
  if (delayMs < -gracePeriodMs) {
    console.log(`[Scheduler] Reminder ${kind} is more than 5 minutes late, skipping`);
    return;
  }

  let message = "";
  switch (kind) {
    case "oneHourBefore":
      message = `🔔 In 1 hour 🔔\n${task.message}`;
      break;
    case "atTime":
      message = `🔔 NOW 🔔\n${task.message}`;
      break;
  }

  try {
    await reminderSender.sendMessage(task.chatId, message);
    console.log(`[Scheduler] Sent reminder for task ${taskId} (${kind})`);

    // Mark as sent in store
    await markReminderSent(taskId, kind);

    // If this was the exact-time reminder, remove the task from the store
    if (kind === "atTime") {
      cancelTimeoutsForTask(taskId);
      await removeTask(taskId);
      console.log(`[Scheduler] Task ${taskId} removed after atTime reminder sent`);
    }
  } catch (e) {
    console.error(`[Scheduler] Failed to send reminder: ${e}`);
  }
}

/**
 * Cancels all scheduled timeouts for a task.
 */
export function cancelTimeoutsForTask(taskId: string): number {
  let cancelled = 0;

  for (const [key, timeout] of scheduledTimeouts.entries()) {
    if (timeout.taskId === taskId) {
      if (timeout.handle) {
        clearTimeout(timeout.handle);
      }
      scheduledTimeouts.delete(key);
      cancelled++;
    }
  }

  console.log(`[Scheduler] Cancelled ${cancelled} timeouts for task ${taskId}`);
  return cancelled;
}

/**
 * Reschedules all reminders for a task.
 * First cancels existing timeouts, then schedules new ones.
 */
export function rescheduleTask(task: Task): void {
  // Cancel existing
  cancelTimeoutsForTask(task.id);

  // Schedule each reminder
  for (const reminder of task.reminders) {
    // Skip if already sent or skipped
    if (reminder.sentAtIso || reminder.skippedReason) {
      continue;
    }
    scheduleReminder(task, reminder.kind, reminder.atIso);
  }
}

/**
 * Initializes the scheduler by loading tasks and rescheduling pending reminders.
 */
export async function initializeScheduler(sender: ReminderSender): Promise<void> {
  setReminderSender(sender);

  // Clean up old reminders and tasks that are past
  const nowUtc = getNowUtc();
  console.log("[Scheduler] Running startup cleanup...");
  const cleanupResult = await cleanupOldRemindersAndTasks(nowUtc);

  // Log cleanup result summary
  console.log(
    `[Scheduler] Cleanup: removed ${cleanupResult.removedTaskIds.length} tasks, ` +
    `skipped ${cleanupResult.skipped.length} reminders`,
  );
  for (const taskId of cleanupResult.removedTaskIds) {
    console.log(`[Scheduler] Removed task: ${taskId}`);
  }
  for (const skipped of cleanupResult.skipped) {
    console.log(`[Scheduler] Skipped reminder: ${skipped.taskId} ${skipped.kind}`);
  }

  const { getScheduledTasks } = await import("./store");
  const tasks = await getScheduledTasks();

  console.log(`[Scheduler] Initializing with ${tasks.length} scheduled tasks`);

  for (const task of tasks) {
    // Skip tasks without chatId (legacy tasks)
    if (!task.chatId) {
      console.log(`[Scheduler] Skipping task ${task.id} - no chatId`);
      continue;
    }
    rescheduleTask(task);
  }

  scheduleDailySummary();

  console.log(`[Scheduler] Initialization complete`);
}

function getNextDailySummaryRun(nowParis: DateTime): DateTime {
  const target = nowParis.set({
    hour: 21,
    minute: 0,
    second: 0,
    millisecond: 0,
  });

  if (nowParis.toMillis() >= target.toMillis()) {
    return target.plus({ days: 1 });
  }

  return target;
}

async function sendDailySummary(): Promise<void> {
  if (!reminderSender) {
    console.error("[Scheduler] No reminder sender available for daily summary");
    return;
  }

  const { getScheduledTasks } = await import("./store");
  const tasks = await getScheduledTasks();
  const nowParis = getNowParis();
  const tomorrow = nowParis.plus({ days: 1 }).startOf("day");
  const tomorrowLabel = formatDateOnly(tomorrow.toISO() as string);
  const grouped = new Map<number, Task[]>();

  for (const task of tasks) {
    if (!task.chatId) {
      continue;
    }

    const dueParis = toParisDateTime(task.dueAtIso);
    if (!dueParis.hasSame(tomorrow, "day")) {
      continue;
    }

    const list = grouped.get(task.chatId) ?? [];
    list.push(task);
    grouped.set(task.chatId, list);
  }

  if (grouped.size === 0) {
    console.log("[Scheduler] No reminders due tomorrow; daily summary not sent");
    return;
  }

  for (const [chatId, list] of grouped.entries()) {
    list.sort((a, b) => Date.parse(a.dueAtIso) - Date.parse(b.dueAtIso));
    const lines = list.map((task) => `- ${formatTimeOnly(task.dueAtIso)} — ${task.message}`);
    const message = `Reminders for tomorrow (${tomorrowLabel}):\n${lines.join("\n")}`;

    try {
      await reminderSender.sendMessage(chatId, message);
      console.log(
        `[Scheduler] Sent daily summary to chat ${chatId} (${list.length} reminders)`,
      );
    } catch (e) {
      console.error(`[Scheduler] Failed to send daily summary: ${e}`);
    }
  }
}

function scheduleDailySummary(): void {
  if (dailySummaryTimeout) {
    clearTimeout(dailySummaryTimeout);
  }

  const nowParis = getNowParis();
  const nextRun = getNextDailySummaryRun(nowParis);
  const delayMs = nextRun.toMillis() - nowParis.toMillis();
  const inMinutes = Math.round(delayMs / 1000 / 60);

  dailySummaryTimeout = setTimeout(async () => {
    await sendDailySummary();
    scheduleDailySummary();
  }, delayMs);

  console.log(
    `[Scheduler] Daily summary scheduled for ${nextRun.setZone(TIMEZONE).toISO()} ` +
    `(in ${inMinutes} minutes)`,
  );
}

/**
 * Returns the message for skipped past reminders.
 * Called when atTime reminder is in the past.
 */
export function getSkippedRemindersMessage(): string {
  return "Can't add reminder in the past";
}
