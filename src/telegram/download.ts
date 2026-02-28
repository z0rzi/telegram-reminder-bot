import { Context } from "telegraf";
import fs from "fs";
import path from "path";

/**
 * Downloads a voice file from Telegram and saves it to /tmp.
 * Returns the path to the saved file.
 */
export async function downloadVoiceFile(
  ctx: Context,
  fileId: string,
): Promise<string> {
  const url = await ctx.telegram.getFileLink(fileId);
  const response = await fetch(url.href);

  if (!response.ok) {
    throw new Error(
      `Failed to download voice file: ${response.status} ${response.statusText}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Determine extension from URL path
  const urlPath = url.pathname.toLowerCase();
  let extension = ".ogg";
  if (urlPath.endsWith(".mp3")) {
    extension = ".mp3";
  } else if (urlPath.endsWith(".wav")) {
    extension = ".wav";
  } else if (urlPath.endsWith(".m4a")) {
    extension = ".m4a";
  }

  const fileName = `voice_${Date.now()}${extension}`;
  const filePath = path.join("/tmp", fileName);

  fs.writeFileSync(filePath, buffer);
  return filePath;
}
