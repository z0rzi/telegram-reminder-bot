import { Context, Markup } from "telegraf";
import { getScheduledTasks, cancelTask } from "../tasks/store";
import { formatForUser } from "../tasks/time";
import { cancelTimeoutsForTask } from "../tasks/scheduler";
import type { Task } from "../tasks/schema";

/**
 * Handles the /cancel command.
 * Shows inline keyboard to select a task to cancel.
 */
export async function handleCancel(ctx: Context) {
  const tasks = await getScheduledTasks();

  if (tasks.length === 0) {
    await ctx.reply("No scheduled tasks to cancel.");
    return;
  }

  const buttons = tasks.map((task, i) => {
    const dueFormatted = formatForUser(task.dueAtIso);
    const label = `${i + 1}) ${task.message.substring(0, 25)} (${dueFormatted})`;
    return [Markup.button.callback(`❌ ${label}`, `cancel:${task.id}`)];
  });

  await ctx.reply("Select a task to cancel:", {
    reply_markup: Markup.inlineKeyboard(buttons).reply_markup,
  });
}

/**
 * Handles callback query for canceling a task.
 */
export async function handleCancelCallback(
  ctx: Context,
  taskId: string,
): Promise<void> {
  await ctx.answerCbQuery();

  const task = await cancelTask(taskId);

  if (!task) {
    await ctx.reply("Task not found or already cancelled.");
    return;
  }

  // Cancel scheduled timeouts
  cancelTimeoutsForTask(taskId);

  const dueFormatted = formatForUser(task.dueAtIso);
  await ctx.editMessageText(
    `❌ Cancelled: ${task.message} (was due ${dueFormatted})`,
  );
}
