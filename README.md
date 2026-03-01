# Telegram Reminder Bot

Small Telegram bot that turns messages (text or voice) into reminders. It stores tasks locally and sends reminders on schedule. It also syncs each reminder to Google Calendar.

# Disclaimer

WARNING: This bot evaluates AI-generated code to detect dates. Use at your own risk.

## Setup

1) Install dependencies

```bash
bun install
```

2) Create a `.env` file

```bash
TELEGRAM_BOT_TOKEN=...
OPENROUTER_API_KEY=...
OPENAI_API_KEY=...
GOOGLE_SERVICE_ACCOUNT_PATH=./google-service-account.json
GOOGLE_CALENDAR_ID=your.calendar@gmail.com
```

3) Google Calendar service account

- Create a service account in Google Cloud
- Enable the Google Calendar API
- Download the JSON key and place it at `./google-service-account.json`
- Share the target calendar with the service account email (permission: “Make changes to events”)

## Run

```bash
bun run start
```

## Commands

- Send a message to create a reminder
- `/list` to see scheduled reminders
- `/cancel` to remove a reminder
- `/reschedule` to change the time

## Notes

- Tasks are stored in `tasks.json`
- Calendar events are created/updated/deleted automatically
