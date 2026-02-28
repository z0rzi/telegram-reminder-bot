import { askAi, type AiMessage } from "../openrouter/client";

/**
 * Generates a JavaScript snippet that computes the due datetime from a time instruction.
 */
export async function generateDateSnippet(
  timeInstruction: string,
  nowIso: string,
): Promise<string> {
  const systemPrompt = `You are a date computation assistant.

Create a JavaScript snippet that computes an ISO datetime from a time instruction.

Context:
- Now is "${nowIso}".
- Timezone is Europe/Paris.
- Week starts on Monday.
- If time is missing, default to 12:00.

The code MUST:
- declare a variable named \`dueIso\` using \`const dueIso = ...\` or \`let dueIso = ...\`
- NEVER assign to \`dueIso\` without first declaring it (e.g., don't use \`dueIso = ...\`)
- end with exactly \`return dueIso;\`

Use the provided \`ctx\` object which has:
- \`ctx.nowIso\`: current ISO string
- \`ctx.DateTime\`: the luxon DateTime class (use for timezone-aware parsing)
- \`ctx.timeZone\`: 'Europe/Paris'
- \`ctx.defaultHour\`: 12
- \`ctx.defaultMinute\`: 0
- \`ctx.startOfWeekMonday\`: function that takes a DateTime and returns the start of week (Monday)

Example usage:
const now = ctx.DateTime.fromISO(ctx.nowIso).setZone(ctx.timeZone);
const due = now.plus({ days: 1 }).set({ hour: 21, minute: 0, second: 0 });
const dueIso = due.toUTC().toISO();
return dueIso;

Only return the code. No markdown. No explanation.`;

  const userPrompt = `Here is the user's time instruction:
"${timeInstruction}"`;

  const messages: AiMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const result = await askAi(messages);

  // Extract JavaScript code (remove any markdown formatting)
  const code = result.replace(/```javascript|```js|```/g, "").trim();

  if (!code.includes("dueIso")) {
    throw new Error(`Generated code does not contain dueIso: ${code}`);
  }

  return code;
}
