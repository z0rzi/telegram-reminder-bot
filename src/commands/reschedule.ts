import { Context, Markup } from "telegraf";
import { getScheduledTasks, updateTask, getTask } from "../tasks/store";
import { formatForUserNoYear, formatForUserRelative, getNowUtc } from "../tasks/time";
import { extractIntent } from "../ai/intent";
import { generateDateSnippet } from "../ai/dateSnippet";
import { evaluateSnippet } from "../ai/evalSnippet";
import { DateTime } from "luxon";
import { computeReminders } from "../tasks/reminders";
import { rescheduleTask, getSkippedRemindersMessage } from "../tasks/scheduler";
import type { ReminderKind } from "../tasks/schema";

// State for reschedule flow
type RescheduleState = {
  taskId: string;
  message: string;
  dueAtIso: string;
};

let pendingReschedule: RescheduleState | null = null;

/**
 * Handles the /reschedule command.
 * Shows inline keyboard to select a task to reschedule.
 */
export async function handleReschedule(ctx: Context) {
  const tasks = await getScheduledTasks();

  if (tasks.length === 0) {
    await ctx.reply("No scheduled tasks to reschedule.");
    return;
  }

  const sorted = [...tasks].sort(
    (a, b) => Date.parse(a.dueAtIso) - Date.parse(b.dueAtIso),
  );

  const buttons = sorted.map((task) => {
    const dueFormatted = formatForUserNoYear(task.dueAtIso);
    const label = `${dueFormatted} — ${task.message.substring(0, 30)}`;
    return [Markup.button.callback(`📅 ${label}`, `resched:${task.id}`)];
  });

  await ctx.reply("Select a task to reschedule:", {
    reply_markup: Markup.inlineKeyboard(buttons).reply_markup,
  });
}

/**
 * Handles callback query for starting reschedule.
 * Sets up pending state and asks for new time.
 */
export async function handleRescheduleStart(
  ctx: Context,
  taskId: string,
): Promise<void> {
  await ctx.answerCbQuery();

  // Get current task info
  const task = await getTask(taskId);

  if (!task) {
    await ctx.reply("Task not found.");
    return;
  }

  // Store pending reschedule state
  pendingReschedule = {
    taskId,
    message: task.message,
    dueAtIso: task.dueAtIso,
  };

  await ctx.editMessageText(
    `Rescheduling: ${task.message}\n\n` +
      `Current due: ${formatForUserNoYear(task.dueAtIso)}\n\n` +
      `Please send me the new date/time (text or voice).`,
  );
}

/**
 * Processes a reschedule request with new time input.
 * Called after user provides new time instruction.
 */
export async function processReschedule(
  ctx: Context,
  rawText: string,
): Promise<boolean> {
  if (!pendingReschedule) {
    return false;
  }

  const taskId = pendingReschedule.taskId;
  const oldMessage = pendingReschedule.message;
  pendingReschedule = null;

  try {
    const nowIso = getNowUtc();

    // Extract intent (we only care about time, reuse message)
    const intent = await extractIntent(rawText, nowIso);

    if (intent.timeInstruction === "unspecified") {
      await ctx.reply(
        "I couldn't understand the new date/time. Please try again with a clearer time.",
      );
      return true;
    }

    // Generate and evaluate snippet
    const code = await generateDateSnippet(intent.timeInstruction, nowIso);

    const snippetCtx = {
      nowIso,
      DateTime,
      timeZone: "Europe/Paris",
      defaultHour: 12,
      defaultMinute: 0,
      startOfWeekMonday: (dt: DateTime) => dt.startOf("week"),
    };

    const newDueIso = evaluateSnippet(code, snippetCtx);

    // Compute new reminders
    const reminders = computeReminders(newDueIso);

    // Check for skipped reminders and mark them with skippedReason
    // Note: we track ALL skipped kinds for persistence, but only warn if atTime is skipped
    const skippedKinds: ReminderKind[] = [];
    for (const reminder of reminders) {
      const delayMs = DateTime.fromISO(reminder.atIso).toMillis() - Date.now();
      if (delayMs <= 0) {
        reminder.skippedReason = "past";
        skippedKinds.push(reminder.kind);
      }
    }

    // Check if atTime reminder was skipped (for user warning)
    const atTimeSkipped = skippedKinds.includes("atTime");

    // Update task
    const updatedTask = await updateTask(taskId, {
      dueAtIso: newDueIso,
      reminders,
      updatedAtIso: getNowUtc(),
    });

    if (!updatedTask) {
      await ctx.reply("Task not found.");
      return true;
    }

    // Reschedule in scheduler
    rescheduleTask(updatedTask);

    const newDueFormatted = formatForUserRelative(newDueIso);

    // Build response
    let response = `Rescheduled: ${oldMessage}\nNew due: ${newDueFormatted}`;

    // Add warning about skipped reminders (only if atTime is skipped)
    if (atTimeSkipped) {
      response += "\n\n" + getSkippedRemindersMessage();
    }

    await ctx.reply(response);
  } catch (e) {
    console.error("Reschedule error:", e);
    await ctx.reply(`Failed to reschedule: ${e}`);
  }

  return true;
}

/**
 * Cancels any pending reschedule flow.
 */
export function cancelPendingReschedule(): void {
  pendingReschedule = null;
}

/**
 * Checks if there's a pending reschedule.
 */
export function hasPendingReschedule(): boolean {
  return pendingReschedule !== null;
}
