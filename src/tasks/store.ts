import fs from "fs";
import { type Task, type TasksFile, type ReminderKind, CURRENT_TASKS_VERSION } from "./schema";

const TASKS_FILE = "./tasks.json";

// Promise queue to serialize file writes
let savePromise: Promise<void> = Promise.resolve();

/**
 * Loads the tasks file, creating it if missing.
 */
export async function loadTasks(): Promise<TasksFile> {
  if (!fs.existsSync(TASKS_FILE)) {
    const initialFile: TasksFile = {
      version: CURRENT_TASKS_VERSION,
      timezone: "Europe/Paris",
      tasks: [],
    };
    saveTasks(initialFile);
    return initialFile;
  }

  try {
    const content = fs.readFileSync(TASKS_FILE, "utf8");
    const data = JSON.parse(content) as TasksFile;
    return data;
  } catch (e) {
    console.error("Failed to load tasks.json:", e);
    // Return empty tasks on error
    return {
      version: CURRENT_TASKS_VERSION,
      timezone: "Europe/Paris",
      tasks: [],
    };
  }
}

/**
 * Saves the tasks file atomically.
 * Uses a promise queue to serialize writes.
 */
export function saveTasks(data: TasksFile): void {
  const content = JSON.stringify(data, null, 2);
  fs.writeFileSync(TASKS_FILE, content, "utf8");
}

/**
 * Adds a new task and saves.
 */
export async function addTask(task: Task): Promise<void> {
  const data = await loadTasks();
  data.tasks.push(task);
  saveTasks(data);
}

/**
 * Updates an existing task by ID.
 */
export async function updateTask(
  taskId: string,
  updates: Partial<Task>,
): Promise<Task | null> {
  const data = await loadTasks();
  const index = data.tasks.findIndex((t) => t.id === taskId);

  if (index === -1) {
    return null;
  }

  data.tasks[index] = { ...data.tasks[index], ...updates };
  saveTasks(data);
  return data.tasks[index];
}

/**
 * Gets a task by ID.
 */
export async function getTask(taskId: string): Promise<Task | null> {
  const data = await loadTasks();
  return data.tasks.find((t) => t.id === taskId) ?? null;
}

/**
 * Gets all tasks.
 */
export async function getAllTasks(): Promise<Task[]> {
  const data = await loadTasks();
  return data.tasks;
}

/**
 * Gets all scheduled (non-cancelled, non-done) tasks.
 */
export async function getScheduledTasks(): Promise<Task[]> {
  const data = await loadTasks();
  return data.tasks.filter((t) => t.status === "scheduled");
}

/**
 * Cancels a task by ID.
 */
export async function cancelTask(taskId: string): Promise<Task | null> {
  const data = await loadTasks();
  const task = data.tasks.find((t) => t.id === taskId);

  if (!task) {
    return null;
  }

  task.status = "cancelled";
  task.updatedAtIso = new Date().toISOString();
  saveTasks(data);
  return task;
}

/**
 * Marks a reminder as sent.
 */
export async function markReminderSent(
  taskId: string,
  reminderKind: ReminderKind,
): Promise<void> {
  const data = await loadTasks();
  const task = data.tasks.find((t) => t.id === taskId);

  if (!task) {
    return;
  }

  const reminder = task.reminders.find((r) => r.kind === reminderKind);
  if (reminder) {
    reminder.sentAtIso = new Date().toISOString();
  }

  saveTasks(data);
}

/**
 * Marks a reminder as skipped with a reason.
 */
export async function markReminderSkipped(
  taskId: string,
  reminderKind: ReminderKind,
  reason: string,
): Promise<void> {
  const data = await loadTasks();
  const task = data.tasks.find((t) => t.id === taskId);

  if (!task) {
    return;
  }

  const reminder = task.reminders.find((r) => r.kind === reminderKind);
  if (reminder) {
    reminder.skippedReason = reason;
  }

  saveTasks(data);
}

/**
 * Result of cleanupOldRemindersAndTasks
 */
export type CleanupResult = {
  removedTaskIds: string[];
  skipped: Array<{ taskId: string; kind: ReminderKind }>;
};

/**
 * Cleans up old reminders and tasks on startup.
 * - For each scheduled task, explicitly finds the atTime reminder
 * - If atTime reminder exists and its atIso time is <= nowMs, removes the task REGARDLESS of skippedReason
 * - Still marks any other reminders in the past (unsent) as skippedReason="past" (even if they already have skippedReason, leave as-is)
 * - Loads tasks once, mutates in memory, then saves once (atomic write via save queue)
 * @param nowIsoUtc - Current UTC time as ISO string for comparison
 * @returns CleanupResult with removed task IDs and skipped reminder details
 */
export async function cleanupOldRemindersAndTasks(nowIsoUtc: string): Promise<CleanupResult> {
  const result: CleanupResult = {
    removedTaskIds: [],
    skipped: [],
  };

  const data = await loadTasks();
  const nowMs = Date.parse(nowIsoUtc);
  const scheduledTasks = data.tasks.filter((t) => t.status === "scheduled");

  // Log start of cleanup
  console.log(`[Cleanup] Starting at ${nowIsoUtc}, processing ${scheduledTasks.length} scheduled tasks`);

  // Process each scheduled task
  const tasksToRemove: string[] = [];

  for (const task of scheduledTasks) {
    // Explicitly find the atTime reminder
    const atTimeReminder = task.reminders.find((r) => r.kind === "atTime");

    // Determine if atTime reminder is in the past (regardless of skippedReason)
    let atTimeIsPast = false;
    let hadExistingSkippedReason = false;

    if (atTimeReminder) {
      const atTimeMs = Date.parse(atTimeReminder.atIso);
      atTimeIsPast = atTimeMs <= nowMs;
      hadExistingSkippedReason = !!atTimeReminder.skippedReason;
    }

    // Mark other past reminders (unsent) as skippedReason="past"
    // Note: we only mark if the reminder hasn't been sent and doesn't already have a skippedReason
    for (const reminder of task.reminders) {
      if (reminder.sentAtIso) {
        continue;
      }

      const reminderMs = Date.parse(reminder.atIso);

      // If reminder time is in the past and has no skippedReason, mark it as skipped
      if (reminderMs <= nowMs && !reminder.skippedReason) {
        reminder.skippedReason = "past";
        result.skipped.push({ taskId: task.id, kind: reminder.kind });
      }
    }

    // If atTime reminder is past (regardless of skippedReason), mark task for removal
    if (atTimeIsPast) {
      tasksToRemove.push(task.id);

      // Log details about the removed task
      console.log(
        `[Cleanup] Removing task: ${task.id} | dueAtIso: ${task.dueAtIso} | ` +
        `atTime.atIso: ${atTimeReminder?.atIso} | hadSkippedReason: ${hadExistingSkippedReason}`,
      );
    }
  }

  // Remove tasks with past atTime reminders
  for (const taskId of tasksToRemove) {
    const index = data.tasks.findIndex((t) => t.id === taskId);
    if (index !== -1) {
      data.tasks.splice(index, 1);
      result.removedTaskIds.push(taskId);
    }
  }

  // Save once if there were any changes
  if (result.removedTaskIds.length > 0 || result.skipped.length > 0) {
    saveTasks(data);
  }

  // Log end summary
  console.log(
    `[Cleanup] Complete: removed ${result.removedTaskIds.length} tasks, ` +
    `skipped ${result.skipped.length} reminders`,
  );

  return result;
}

/**
 * Removes a task from the store by ID.
 * Returns true if the task was found and removed, false otherwise.
 * Uses the existing save queue for serialization.
 */
export async function removeTask(taskId: string): Promise<boolean> {
  const data = await loadTasks();
  const index = data.tasks.findIndex((t) => t.id === taskId);

  if (index === -1) {
    return false;
  }

  data.tasks.splice(index, 1);
  saveTasks(data);
  return true;
}
