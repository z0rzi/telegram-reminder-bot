import { DateTime } from "luxon";
import { nanoid } from "nanoid";
import { Context, Telegraf } from "telegraf";
import { generateDateSnippet } from "./ai/dateSnippet";
import { evaluateSnippet } from "./ai/evalSnippet";
import { extractIntent } from "./ai/intent";
import { handleCancel, handleCancelCallback } from "./commands/cancel";
import { handleHelp } from "./commands/help";
import { handleList } from "./commands/list";
import {
    handleReschedule,
    handleRescheduleStart,
    hasPendingReschedule,
    processReschedule,
} from "./commands/reschedule";
import env from "./env";
import { transcribeAudio } from "./openai/whisper";
import { computeReminders } from "./tasks/reminders";
import { getSkippedRemindersMessage, initializeScheduler, setReminderSender } from "./tasks/scheduler";
import { type ReminderKind, type Task } from "./tasks/schema";
import { addTask } from "./tasks/store";
import { formatForUserRelative, getNowUtc } from "./tasks/time";
import { downloadVoiceFile } from "./telegram/download";

// Initialize environment
const TELEGRAM_BOT_TOKEN = env("TELEGRAM_BOT_TOKEN");

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

/**
 * Creates a ReminderSender from the bot instance.
 */
function createReminderSender() {
  return {
    sendMessage: async (chatId: number, text: string): Promise<void> => {
      await bot.telegram.sendMessage(chatId, text);
    },
  };
}

// Set reminder sender synchronously BEFORE any handlers are registered
// This ensures sender is available when timeouts fire (fixes race condition)
setReminderSender(createReminderSender());

/**
 * Processes a text or transcribed message to create/update a task.
 */
async function processTaskInput(ctx: Context, rawText: string): Promise<void> {
  try {
    const nowIso = getNowUtc();

    // Step 1: Extract intent
    const intent = await extractIntent(rawText, nowIso);

    if (intent.timeInstruction === "unspecified") {
      await ctx.reply(
        "I couldn't understand the date/time. Please provide when you want to be reminded.",
      );
      return;
    }

    // Step 2: Generate date snippet
    const code = await generateDateSnippet(intent.timeInstruction, nowIso);

    // Step 3: Evaluate snippet safely
    const snippetCtx = {
      nowIso,
      DateTime,
      timeZone: "Europe/Paris" as const,
      defaultHour: 12,
      defaultMinute: 0,
      startOfWeekMonday: (dt: DateTime) => dt.startOf("week"),
    };

    const dueAtIso = evaluateSnippet(code, snippetCtx);

    // Step 4: Compute reminders
    const reminders = computeReminders(dueAtIso);

    // Step 5: Check for past reminders and mark them as skipped
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

    // Step 6: Create task with chatId
    const taskId = `tsk_${nanoid(12)}`;
    const task: Task = {
      id: taskId,
      chatId: ctx.chat!.id,
      message: intent.message,
      dueAtIso,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      status: "scheduled",
      reminders,
    };

    // Step 7: Save to store
    await addTask(task);

    // Step 8: Schedule reminders (those not skipped)
    for (const reminder of reminders) {
      if (!reminder.skippedReason) {
        scheduleReminder(task, reminder.kind, reminder.atIso);
      }
    }

    // Step 9: Confirm to user
    const dueFormatted = formatForUserRelative(dueAtIso);
    let response = `Ok, I'll remind you about "${intent.message}" ${dueFormatted}`;

    if (atTimeSkipped) {
      response += "\n\n" + getSkippedRemindersMessage();
    }

    await ctx.reply(response);
  } catch (e) {
    console.error("Error processing task:", e);
    await ctx.reply(`Failed to create reminder: ${e}`);
  }
}

/**
 * Helper to schedule a single reminder.
 */
async function scheduleReminder(task: Task, kind: ReminderKind, atIso: string) {
  const { scheduleReminder: schedule } = await import("./tasks/scheduler");
  schedule(task, kind, atIso);
}

// Handle text messages
bot.on("text", async (ctx, next) => {
  const text = ctx.message.text;

  // Pass to next middleware (command handlers) for messages starting with "/"
  if (text.startsWith("/")) {
    return next();
  }

  // Check for pending reschedule
  if (hasPendingReschedule()) {
    await processReschedule(ctx, text);
    return;
  }

  // Process as new task
  await processTaskInput(ctx, text);
});

// Handle voice messages
bot.on("voice", async (ctx) => {
  // Check for pending reschedule - allow voice during reschedule
  if (hasPendingReschedule()) {
    try {
      const voice = ctx.message.voice;

      // Download voice file
      await ctx.reply("Transcribing...");
      const filePath = await downloadVoiceFile(ctx, voice.file_id);

      // Transcribe
      const transcription = await transcribeAudio(filePath);

      if (!transcription || transcription.trim() === "") {
        await ctx.reply("I couldn't understand the voice message.");
        return;
      }

      await ctx.reply(`Heard: "${transcription}"`);

      // Process as reschedule with transcribed text
      await processReschedule(ctx, transcription);
    } catch (e) {
      console.error("Error processing voice for reschedule:", e);
      await ctx.reply(`Failed to process voice: ${e}`);
    }
    return;
  }

  // Normal voice message processing (create new task)
  try {
    const voice = ctx.message.voice;

    // Download voice file
    await ctx.reply("Transcribing...");
    const filePath = await downloadVoiceFile(ctx, voice.file_id);

    // Transcribe
    const transcription = await transcribeAudio(filePath);

    if (!transcription || transcription.trim() === "") {
      await ctx.reply("I couldn't understand the voice message.");
      return;
    }

    await ctx.reply(`Heard: "${transcription}"`);

    // Process as task
    await processTaskInput(ctx, transcription);
  } catch (e) {
    console.error("Error processing voice:", e);
    await ctx.reply(`Failed to process voice: ${e}`);
  }
});

// Command handlers
bot.command("help", async (ctx) => {
  await handleHelp(ctx);
});

bot.command("list", async (ctx) => {
  await handleList(ctx);
});

bot.command("cancel", async (ctx) => {
  await handleCancel(ctx);
});

bot.command("reschedule", async (ctx) => {
  await handleReschedule(ctx);
});

// Callback query handler for inline buttons
bot.on("callback_query", async (ctx) => {
  const callbackQuery = ctx.callbackQuery;

  // Handle only callback queries with data (not game queries)
  if (!("data" in callbackQuery) || !callbackQuery.data) {
    return;
  }

  const data = callbackQuery.data;

  if (data.startsWith("cancel:")) {
    const taskId = data.slice(7);
    await handleCancelCallback(ctx, taskId);
  } else if (data.startsWith("resched:")) {
    const taskId = data.slice(8);
    await handleRescheduleStart(ctx, taskId);
  }
});

/**
 * Wraps a promise with a timeout.
 * @param p The promise to wrap
 * @param ms Timeout in milliseconds
 * @param label Description for error message
 * @returns The result of the promise
 * @throws Error if timeout is reached
 */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);

    p.then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Main async function that starts the bot with proper error handling and logging.
 */
async function main() {
  // Log startup beginning
  console.log("Starting bot...");

  // Step 1: Validate Telegram token by getting bot info
  console.log("Validating Telegram token...");
  const botInfo = await withTimeout(bot.telegram.getMe(), 15000, "getMe");
  console.log("Token validated...");

  // Step 2: Launch polling (DO NOT await - polling runs indefinitely)
  console.log("Launching polling...");
  const launchPromise = bot.launch({ dropPendingUpdates: true });

  // Attach error handler to catch launch failures
  launchPromise.catch((err) => {
    console.error("Failed to launch polling:", err);
    console.error("Hint: Check network/proxy/firewall settings. Telegram API may be unreachable.");
    process.exit(1);
  });

  // Add a short timeout to detect immediate failures (but don't block forever)
  // This ensures we detect quick failures without waiting for the never-resolving polling promise
  await withTimeout(
    new Promise<void>((resolve) => {
      // Give polling a moment to start/fail, then resolve
      setTimeout(resolve, 5000);
    }),
    6000,
    "polling start",
  ).catch(() => {
    // Timeout is expected - polling is running, not a problem
  });

  // Step 3: Log bot started and initialize scheduler immediately
  // bot.telegram is usable after token validation, so we can proceed
  console.log(`Bot started as @${botInfo.username}`);

  // Step 4: Initialize scheduler with pending reminders from previous sessions
  await initializeScheduler(createReminderSender());
  console.log("Scheduler initialized");
}

/**
 * Catches middleware errors that aren't caught by specific handlers.
 */
bot.catch((err, ctx) => {
  console.error("Telegraf error", err);
  if (ctx && ctx.from) {
    ctx.reply("An error occurred while processing your request.").catch(console.error);
  }
});

// Run main function - this will initialize everything
main().catch((err) => {
  console.error("Fatal error during startup:", err);
  process.exit(1);
});

export { bot };
