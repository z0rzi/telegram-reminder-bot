import env from "../env";

const OPENAI_API_KEY = env("OPENAI_API_KEY");

/**
 * Transcribes an audio file using OpenAI Whisper API.
 * Accepts various audio formats including ogg/opus, mp3, wav, m4a.
 */
export async function transcribeAudio(filePath: string): Promise<string> {
  const fileData = Bun.file(filePath);

  const form = new FormData();
  form.append("file", fileData, "audio.ogg");
  form.append("model", "whisper-1");

  const response = await fetch(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: form,
    },
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(
      `OpenAI Whisper API error: ${response.status} - ${err}`,
    );
  }

  const data = (await response.json()) as { text: string };
  return data.text;
}
