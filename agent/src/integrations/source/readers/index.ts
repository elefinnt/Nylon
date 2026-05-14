import { extname } from "node:path";
import type { DocumentChunk } from "./types.js";
import { readTextFile } from "./text.js";
import { readPdfFile, type PdfReadOptions } from "./pdf.js";
import { readDocxFile } from "./docx.js";

export type { DocumentChunk, TextChunk, ImageChunk, ChunkSource } from "./types.js";

export interface ReadOptions {
  pdf?: PdfReadOptions;
}

const TEXT_EXTENSIONS = new Set([".md", ".mdx", ".txt", ".text"]);

/**
 * Dispatches to the correct reader based on file extension.
 * Throws if the extension is unsupported.
 */
export async function readDocument(
  filePath: string,
  opts: ReadOptions = {},
): Promise<DocumentChunk[]> {
  const ext = extname(filePath).toLowerCase();

  if (TEXT_EXTENSIONS.has(ext)) {
    return readTextFile(filePath);
  }

  if (ext === ".pdf") {
    return readPdfFile(filePath, opts.pdf);
  }

  if (ext === ".docx") {
    return readDocxFile(filePath);
  }

  throw new Error(
    `Unsupported file type "${ext}" for "${filePath}". ` +
      `Supported: .md, .mdx, .txt, .pdf, .docx`,
  );
}

/** Returns true if the extension is supported by any reader. */
export function isSupportedExtension(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return TEXT_EXTENSIONS.has(ext) || ext === ".pdf" || ext === ".docx";
}
