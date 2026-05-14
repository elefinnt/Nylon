export interface ChunkSource {
  /** Absolute or workspace-relative path to the originating file. */
  path: string;
  /** 1-indexed page number for paginated formats (PDF). */
  page?: number;
  /** Section heading the chunk falls under, if detectable. */
  heading?: string;
}

export interface TextChunk {
  kind: "text";
  text: string;
  source: ChunkSource;
}

/**
 * Image chunk for vision-capable providers. Produced by the PDF vision
 * reader when text extraction yields too little content.
 */
export interface ImageChunk {
  kind: "image";
  base64: string;
  mimeType: "image/png" | "image/jpeg";
  source: ChunkSource;
}

export type DocumentChunk = TextChunk | ImageChunk;
