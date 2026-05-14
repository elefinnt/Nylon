import { readFileSync } from "node:fs";
import type { TextChunk } from "./types.js";

/**
 * Reads a .docx file and returns its content as TextChunks.
 * Mammoth converts the document to plain text, preserving paragraph
 * breaks. We then split on headings (h1–h3) that mammoth marks with
 * a leading "#" sequence when using the markdown output mode.
 */
export async function readDocxFile(filePath: string): Promise<TextChunk[]> {
  // Dynamic import keeps mammoth out of the module graph for installs
  // that don't need it.
  const mammoth = (await import("mammoth")).default;

  const buffer = readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer });

  if (result.messages.length > 0) {
    for (const msg of result.messages) {
      if (msg.type === "error") {
        process.stderr.write(`[nylon] docx warning (${filePath}): ${msg.message}\n`);
      }
    }
  }

  const text = result.value.trim();
  if (text.length === 0) return [];

  return [
    {
      kind: "text",
      text,
      source: { path: filePath },
    },
  ];
}
