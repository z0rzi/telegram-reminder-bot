import { DateTime } from "luxon";

/**
 * Denylist of dangerous patterns to check before evaluating code.
 */
const DENYLIST_PATTERNS = [
  /fetch\s*\(/,
  /Bun\./,
  /process\./,
  /require\s*\(/,
  /import\s+/,
  /fs\./,
  /child_process/,
  /Deno\./,
  /net\./,
  /http\./,
  /https\./,
  /eval\s*\(/,
  /Function\s*\(/,
  /__dirname/,
  /__filename/,
  /globalThis/,
  /global\./,
  /window\./,
  /document\./,
  /console\./,
  /setInterval\s*\(/,
  /setImmediate\s*\(/,
  /exec\s*\(/,
  /spawn\s*\(/,
];

/**
 * Context object passed to the evaluated snippet.
 */
export interface SnippetContext {
  nowIso: string;
  DateTime: typeof DateTime;
  timeZone: string;
  defaultHour: number;
  defaultMinute: number;
  startOfWeekMonday: (dt: DateTime) => DateTime;
}

/**
 * Evaluates a JavaScript snippet safely and returns the computed due ISO string.
 * Validates the result is a valid ISO datetime.
 */
export function evaluateSnippet(
  code: string,
  ctx: SnippetContext,
): string {
  // Static check for dangerous patterns
  for (const pattern of DENYLIST_PATTERNS) {
    if (pattern.test(code)) {
      throw new Error(
        `Snippet contains forbidden pattern: ${pattern.toString()}`,
      );
    }
  }

  // Check if dueIso is declared (const|let|var dueIso) or assigned (dueIso =)
  const hasDeclaration = /(?:const|let|var)\s+dueIso\b/.test(code);
  const hasAssignment = /dueIso\s*=/.test(code);

  if (!hasDeclaration && !hasAssignment) {
    throw new Error(
      `Snippet must either declare 'dueIso' (const/let/var dueIso) or assign to it (dueIso = ...).`,
    );
  }

  // If dueIso is not declared but is assigned, prefix with "let dueIso;"
  let codeToEvaluate: string;
  if (!hasDeclaration && hasAssignment) {
    // Prepend "let dueIso;" so assignment works in strict mode
    codeToEvaluate = `let dueIso;\n${code}`;
  } else {
    codeToEvaluate = code;
  }

  // If code doesn't contain a return statement, append one
  const hasReturn = /\breturn\s+dueIso\s*;?/.test(codeToEvaluate);
  codeToEvaluate = hasReturn ? codeToEvaluate : `${codeToEvaluate}\nreturn dueIso;`;

  // Create function with ctx argument
  const fn = new Function("ctx", `"use strict";\n${codeToEvaluate}`);

  // Execute with context
  const result = fn(ctx);

  // Validate result
  if (typeof result !== "string") {
    throw new Error(
      `Snippet must return a string, got: ${typeof result}. The snippet must 'return dueIso;'.`,
    );
  }

  // Validate ISO datetime
  const parsed = DateTime.fromISO(result);
  if (!parsed.isValid) {
    throw new Error(`Result is not a valid ISO datetime: ${result}`);
  }

  return result;
}
