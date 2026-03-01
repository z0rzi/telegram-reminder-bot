import { Context } from "telegraf";
import { getScheduledTasks } from "../tasks/store";
import { formatTimeOnly, toParisDateTime } from "../tasks/time";

/**
 * Handles the /list command.
 * Shows all scheduled tasks grouped by day.
 */
export async function handleList(ctx: Context) {
  const tasks = await getScheduledTasks();

  if (tasks.length === 0) {
    await ctx.reply("No scheduled tasks.");
    return;
  }

  const sorted = [...tasks].sort(
    (a, b) => Date.parse(a.dueAtIso) - Date.parse(b.dueAtIso),
  );

  const lines: string[] = [];
  let currentDay = "";

  for (const task of sorted) {
    const dueParis = toParisDateTime(task.dueAtIso);
    const dayLabel = dueParis.toFormat("cccc dd/MM/yyyy");

    if (dayLabel !== currentDay) {
      currentDay = dayLabel;
      if (lines.length > 0) {
        lines.push("");
      }
      lines.push(dayLabel);
    }

    const time = formatTimeOnly(task.dueAtIso);
    lines.push(`- ${time} — ${task.message}`);
  }

  const message = lines.join("\n");

  await ctx.reply(message);
}
