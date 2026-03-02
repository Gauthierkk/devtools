import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

export async function openJsonFile(): Promise<{
  content: string;
  path: string;
} | null> {
  const selected = await open({
    multiple: false,
    filters: [
      { name: "JSON", extensions: ["json", "jsonc", "geojson"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  if (!selected) return null;

  const path = typeof selected === "string" ? selected : selected;
  const content = await readTextFile(path);
  return { content, path };
}

export async function saveJsonFile(
  content: string,
  existingPath: string | null,
): Promise<string | null> {
  let path = existingPath;

  if (!path) {
    const selected = await save({
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!selected) return null;
    path = selected;
  }

  await writeTextFile(path, content);
  return path;
}

export function formatJson(content: string, indent: number = 2): string {
  const parsed = JSON.parse(content);
  return indent === 0
    ? JSON.stringify(parsed)
    : JSON.stringify(parsed, null, indent);
}

export function extractErrorPosition(
  error: Error,
  content: string,
): { line: number; column: number } {
  const msg = error.message;

  // V8 older: "Unexpected token X in JSON at position 42"
  const posMatch = msg.match(/at position (\d+)/);
  if (posMatch) {
    const pos = Math.min(parseInt(posMatch[1]), content.length);
    const before = content.substring(0, pos);
    const lines = before.split("\n");
    return { line: lines.length, column: lines[lines.length - 1].length + 1 };
  }

  // Firefox: "at line X column Y"
  const lineColMatch = msg.match(/at line (\d+) column (\d+)/);
  if (lineColMatch) {
    return {
      line: parseInt(lineColMatch[1]),
      column: parseInt(lineColMatch[2]),
    };
  }

  // V8 newer: "Unexpected token 'X', ..." — find last occurrence of that char
  const tokenMatch = msg.match(/Unexpected token '(.)'/);
  if (tokenMatch) {
    const token = tokenMatch[1];
    const pos = content.lastIndexOf(token);
    if (pos >= 0) {
      const before = content.substring(0, pos);
      const lines = before.split("\n");
      return { line: lines.length, column: lines[lines.length - 1].length + 1 };
    }
  }

  // "Unexpected end of JSON input" / truncated — point to last line
  if (msg.includes("end of JSON") || msg.includes("Unexpected end")) {
    const lines = content.split("\n");
    return { line: lines.length, column: lines[lines.length - 1].length + 1 };
  }

  return { line: 0, column: 0 };
}

export function validateJson(content: string): {
  valid: boolean;
  error?: string;
  line?: number;
  column?: number;
} {
  try {
    JSON.parse(content);
    return { valid: true };
  } catch (e) {
    const { line, column } = extractErrorPosition(e as Error, content);
    return { valid: false, error: (e as Error).message, line, column };
  }
}
