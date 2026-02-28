import { askAi, type AiMessage } from "../openrouter/client";

/**
 * Result from intent extraction
 */
export interface IntentResult {
  message: string;
  timeInstruction: string;
}

/**
 * Extracts task message and time instruction from raw user text.
 * Uses strict JSON parsing.
 */
export async function extractIntent(
  rawText: string,
  nowIso: string,
): Promise<IntentResult> {
  const systemPrompt = `You are a task reminder parser.

Given a user's sentence, extract:
1) message: what the user wants to be reminded about (imperative, no date/time words)
2) timeInstruction: the date/time instruction portion (relative or absolute)

Rules:
- If the user includes no time at all, set timeInstruction to "unspecified".
- Do NOT guess specific dates.
- Keep message short and title-like.
- Return STRICT JSON only, no markdown, no extra text.

Example:
Input: "Lena's driving class tomorrow at 9PM"
Output: {"message":"Lena's driving class","timeInstruction":"tomorrow at 9PM"}`;

  const userPrompt = `Today is: ${nowIso}
Timezone: Europe/Paris
User text: ${rawText}`;

  const messages: AiMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const result = await askAi(messages);

  // Extract JSON from response
  const jsonMatch = result.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Could not parse intent JSON from: ${result}`);
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.message || typeof parsed.message !== "string") {
      throw new Error("Missing or invalid 'message' field");
    }
    if (!parsed.timeInstruction || typeof parsed.timeInstruction !== "string") {
      throw new Error("Missing or invalid 'timeInstruction' field");
    }

    return {
      message: parsed.message,
      timeInstruction: parsed.timeInstruction,
    };
  } catch (e) {
    throw new Error(`Failed to parse intent JSON: ${e}`);
  }
}
