import { Context, Markup } from "telegraf";
import { getScheduledTasks } from "../tasks/store";
import { formatForUser } from "../tasks/time";

/**
 * Handles the /list command.
 * Shows all scheduled tasks with inline buttons for cancel/reschedule.
 */
export async function handleList(ctx: Context) {
  const tasks = await getScheduledTasks();

  if (tasks.length === 0) {
    await ctx.reply("No scheduled tasks.");
    return;
  }

  const taskLines: string[] = [];

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const dueFormatted = formatForUser(task.dueAtIso);
    taskLines.push(`${i + 1}) ${task.message} — ${dueFormatted}`);
  }

  const message = taskLines.join("\n");

  // Build inline keyboard with buttons for each task
  const buttons = tasks.map((task, i) => {
    const label = `${i + 1}) ${task.message.substring(0, 30)}${task.message.length > 30 ? "..." : ""}`;
    return [
      Markup.button.callback(`❌ Cancel`, `cancel:${task.id}`),
      Markup.button.callback(`📅 Reschedule`, `resched:${task.id}`),
    ];
  });

  await ctx.reply(message, {
    reply_markup: Markup.inlineKeyboard(buttons.flat(), {
      columns: 2,
    }).reply_markup,
  });
}
