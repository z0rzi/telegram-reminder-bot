import fs from "fs";
import path from "path";

export default function env(varName: string, expectedType?: "string"): string;
export default function env(varName: string, expectedType: "number"): number;
export default function env(
  varName: string,
  expectedType?: "number" | "string",
): number | string {
  const value = process.env[varName];
  if (value == null) throw new Error(`Could not find env var '${varName}'`);

  if (expectedType === "number") {
    const numValue = Number(value);
    if (isNaN(numValue))
      throw new Error(
        `Expected '${varName}' to be a number, but it's not: '${value}'`,
      );
    return numValue;
  }
  return value;
}

function parseDotEnv(envFilePath: string) {
  const lines = fs.readFileSync(envFilePath, "utf8").split("\n");
  for (const line of lines) {
    if (line.startsWith("#") || !line.trim()) continue;
    if (!line.includes("=")) {
      throw new Error(`Invalid line in .env file: ${line}`);
    }
    const equalIdx = line.indexOf("=");
    const key = line.slice(0, equalIdx).trim();
    const value = line.slice(equalIdx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

let cwd = path.resolve(process.cwd());
while (cwd !== "/") {
  const envFile = path.join(cwd, ".env");
  if (fs.existsSync(envFile)) {
    console.log("Loading .env file", envFile);
    parseDotEnv(envFile);
  }
  cwd = path.resolve(cwd, "..");
}
