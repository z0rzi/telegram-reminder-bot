import fs from "fs";
import path from "path";
import { DateTime } from "luxon";
import { google, type calendar_v3 } from "googleapis";
import env from "../env";
import type { Task } from "../tasks/schema";

const SCOPES = ["https://www.googleapis.com/auth/calendar"];
const DEFAULT_TIMEZONE = "Europe/Paris";
const DEFAULT_EVENT_MINUTES = 60;

let calendarClientPromise: Promise<calendar_v3.Calendar> | null = null;
let cachedCalendarId: string | null = null;

function getCalendarId(): string {
  if (!cachedCalendarId) {
    cachedCalendarId = env("GOOGLE_CALENDAR_ID");
  }
  return cachedCalendarId;
}

function resolveServiceAccountPath(): string {
  const rawPath = env("GOOGLE_SERVICE_ACCOUNT_PATH");
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
}

async function getCalendarClient(): Promise<calendar_v3.Calendar> {
  if (!calendarClientPromise) {
    calendarClientPromise = (async () => {
      const keyFile = resolveServiceAccountPath();
      if (!fs.existsSync(keyFile)) {
        throw new Error(`Google service account file not found at: ${keyFile}`);
      }

      const auth = new google.auth.GoogleAuth({
        keyFile,
        scopes: SCOPES,
      });

      const authClient = await auth.getClient();
      return google.calendar({ version: "v3", auth: authClient });
    })();
  }

  return calendarClientPromise;
}

function buildEventTimes(dueAtIso: string) {
  const start = DateTime.fromISO(dueAtIso).setZone(DEFAULT_TIMEZONE);
  const end = start.plus({ minutes: DEFAULT_EVENT_MINUTES });

  return {
    start: {
      dateTime: start.toISO(),
      timeZone: DEFAULT_TIMEZONE,
    },
    end: {
      dateTime: end.toISO(),
      timeZone: DEFAULT_TIMEZONE,
    },
  };
}

export async function createCalendarEvent(task: Task): Promise<string | null> {
  const calendar = await getCalendarClient();
  const times = buildEventTimes(task.dueAtIso);

  const response = await calendar.events.insert({
    calendarId: getCalendarId(),
    requestBody: {
      summary: task.message,
      description: `Telegram reminder: ${task.message}`,
      ...times,
    },
  });

  return response.data.id ?? null;
}

export async function updateCalendarEvent(task: Task): Promise<void> {
  if (!task.googleCalendarEventId) {
    return;
  }

  const calendar = await getCalendarClient();
  const times = buildEventTimes(task.dueAtIso);

  await calendar.events.patch({
    calendarId: getCalendarId(),
    eventId: task.googleCalendarEventId,
    requestBody: {
      summary: task.message,
      description: `Telegram reminder: ${task.message}`,
      ...times,
    },
  });
}

export async function deleteCalendarEvent(task: Task): Promise<void> {
  if (!task.googleCalendarEventId) {
    return;
  }

  const calendar = await getCalendarClient();

  await calendar.events.delete({
    calendarId: getCalendarId(),
    eventId: task.googleCalendarEventId,
  });
}
