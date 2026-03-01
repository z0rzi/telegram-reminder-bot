import { Context, Markup } from "telegraf";

/**
 * Handles the /help command.
 * Lists all available slash commands and their descriptions.
 */
export async function handleHelp(ctx: Context) {
  const helpMessage = `Available commands:

/help - Show this list of commands
/list - Show all scheduled tasks
/cancel - Cancel a scheduled task
/reschedule - Reschedule a task`;

  await ctx.reply(helpMessage, {
    reply_markup: Markup.keyboard(["/help", "/list", "/cancel", "/reschedule"])
      .reply_markup,
  });
}
