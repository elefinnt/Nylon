import { createRequire } from "node:module";
import type { DocumentChunk, TextChunk } from "./types.js";

const require = createRequire(import.meta.url);

/**
 * Minimum average characters per page before we flag a PDF as likely
 * image-only. Below this threshold a warning is emitted and the chunks
 * will contain whatever sparse text was extracted.
 */
const SPARSE_THRESHOLD_CHARS_PER_PAGE = 50;

export interface PdfReadOptions {
  /** "vision" is accepted but currently falls back to text extraction with a notice. */
  strategy?: "auto" | "text" | "vision";
  maxCharsPerDoc?: number;
}

/**
 * Reads a PDF and returns one TextChunk per page that has extractable text.
 *
 * PDF strategy:
 *  - "text"  — always use text extraction (default for now).
 *  - "auto"  — text extraction first; emits a warning if the document
 *              appears to be image-only (sparse text). Vision fallback
 *              will be added in a future release.
 */
export async function readPdfFile(
  filePath: string,
  opts: PdfReadOptions = {},
): Promise<DocumentChunk[]> {
  const { strategy = "auto", maxCharsPerDoc = 80_000 } = opts;

  if (strategy === "vision") {
    process.stderr.write(
      `[nylon] Info: pdf_strategy = "vision" is not yet implemented; using text extraction.\n`,
    );
  }

  // pdfjs-dist v4+ requires a workerSrc. In Node we use the legacy build
  // which ships a bundled worker we can disable by pointing at a no-op.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js") as any;
  pdfjsLib.GlobalWorkerOptions.workerSrc = "";

  const data = await readFile(filePath);
  const loadingTask = pdfjsLib.getDocument({ data, disableWorker: true });
  const pdf = await loadingTask.promise;

  const numPages: number = pdf.numPages;
  const chunks: TextChunk[] = [];
  let totalChars = 0;

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    if (totalChars >= maxCharsPerDoc) break;

    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((item: any) => ("str" in item ? (item.str as string) : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (pageText.length === 0) continue;

    const remaining = maxCharsPerDoc - totalChars;
    const text = pageText.length > remaining ? pageText.slice(0, remaining) + "…" : pageText;
    totalChars += text.length;

    chunks.push({
      kind: "text",
      text,
      source: { path: filePath, page: pageNum },
    });
  }

  if (strategy === "auto") {
    const avgCharsPerPage = totalChars / Math.max(numPages, 1);
    if (avgCharsPerPage < SPARSE_THRESHOLD_CHARS_PER_PAGE && numPages > 0) {
      process.stderr.write(
        `[nylon] Warning: "${filePath}" yielded very little text (${Math.round(avgCharsPerPage)} chars/page).\n` +
          `  This PDF may be image-only. Vision-based extraction is planned for a future release.\n`,
      );
    }
  }

  return chunks;
}

async function readFile(filePath: string): Promise<Uint8Array> {
  const { readFileSync } = await import("node:fs");
  const buf = readFileSync(filePath);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}
