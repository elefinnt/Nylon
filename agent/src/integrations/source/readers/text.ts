import { readFileSync } from "node:fs";
import type { TextChunk } from "./types.js";

/**
 * Reads plain-text files (.txt, .md, .mdx) as a single chunk.
 * Heading detection splits on Markdown ATX headings so sourceRef.heading
 * can be populated downstream, but for now we emit one chunk per file
 * and let the model handle section detection via the raw text.
 */
export function readTextFile(filePath: string): TextChunk[] {
  const raw = readFileSync(filePath, "utf8");
  const text = raw.trim();
  if (text.length === 0) return [];

  // Split on top-level headings so large docs get section-scoped chunks.
  const sections = splitByHeadings(text, filePath);
  return sections;
}

function splitByHeadings(text: string, filePath: string): TextChunk[] {
  const headingRe = /^(#{1,3})\s+(.+)$/m;
  const lines = text.split("\n");

  const chunks: TextChunk[] = [];
  let currentHeading: string | undefined;
  let buffer: string[] = [];

  const flush = () => {
    const content = buffer.join("\n").trim();
    if (content.length > 0) {
      chunks.push({
        kind: "text",
        text: content,
        source: { path: filePath, heading: currentHeading },
      });
    }
    buffer = [];
  };

  for (const line of lines) {
    if (headingRe.test(line)) {
      flush();
      currentHeading = line.replace(/^#+\s+/, "").trim();
      buffer.push(line);
    } else {
      buffer.push(line);
    }
  }
  flush();

  // If no headings were found we get a single chunk — that's fine.
  return chunks;
}
