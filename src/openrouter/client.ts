import env from "../env";

const OPENROUTER_API_KEY = env("OPENROUTER_API_KEY");

export const aiModels = {
  "Claude 3.7 Sonnet": "anthropic/claude-3.7-sonnet",
  "Claude 3.7 Sonnet Thinking": "anthropic/claude-3.7-sonnet:thinking",
  "GPT 4.1": "openai/gpt-4.1",
  "GPT 4.1 Nano": "openai/gpt-4.1-nano",
  "Gemini Flash 2.0": "google/gemini-2.0-flash-001",
  "Perplexity Sonar Pro": "perplexity/sonar-pro",
} as const;

export type AiModels = (typeof aiModels)[keyof typeof aiModels];

export type AiOptions = {
  model?: AiModels;
};

export type AiMessageContent = string | Array<{
  type: "text";
  text: string;
}>;

export type AiMessage = {
  role: "user" | "assistant" | "system";
  content: AiMessageContent;
};

export type OpenRouterResponse = {
  id: string;
  provider: string;
  model: string;
  object: string;
  created: number;
  choices: {
    logprobs: null;
    finish_reason: string;
    native_finish_reason: string;
    index: number;
    message: {
      role: string;
      content: string;
      refusal: null;
    };
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

/**
 * Sends a chat completion request to OpenRouter.
 */
export async function askAi(messages: AiMessage[], options?: AiOptions) {
  const fetchParams = {
    model: options?.model ?? aiModels["Gemini Flash 2.0"],
    messages: messages,
  };

  const res = (await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + OPENROUTER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(fetchParams),
    },
  ).then((res) => res.json())) as OpenRouterResponse;

  if (!res.choices || !res.choices[0]?.message?.content) {
    console.error("No content in response:", JSON.stringify(res, null, 2));
    throw new Error("No content in OpenRouter response");
  }

  return res.choices[0].message.content;
}
