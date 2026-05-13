import { stdout } from "node:process";
import { z } from "zod";

/**
 * Wire protocol shared between the C++ CLI and this Node agent.
 *
 * - One JSON object per line on stdin (requests) and stdout (events).
 * - stderr is reserved for human-readable logs (pino).
 */

export const reviewRequestSchema = z.object({
  type: z.literal("review"),
  url: z.string().url(),
  provider: z.string().min(1),
  model: z.string().min(1),
  postReview: z.boolean().default(true),
});

export const initRequestSchema = z.object({
  type: z.literal("init"),
  path: z.string().min(1).optional(),
});

export const listProvidersRequestSchema = z.object({
  type: z.literal("listProviders"),
});

export const pingRequestSchema = z.object({
  type: z.literal("ping"),
});

export const cancelRequestSchema = z.object({
  type: z.literal("cancel"),
});

export const requestSchema = z.discriminatedUnion("type", [
  reviewRequestSchema,
  initRequestSchema,
  listProvidersRequestSchema,
  pingRequestSchema,
  cancelRequestSchema,
]);

export type Request = z.infer<typeof requestSchema>;
export type ReviewRequest = z.infer<typeof reviewRequestSchema>;
export type InitRequest = z.infer<typeof initRequestSchema>;
export type ListProvidersRequest = z.infer<typeof listProvidersRequestSchema>;

export const progressStages = [
  "startup",
  "loadingConfig",
  "fetching",
  "chunking",
  "reviewing",
  "posting",
  "done",
] as const;
export type ProgressStage = (typeof progressStages)[number];

export type AgentEvent =
  | { type: "pong"; version: string }
  | {
      type: "providers";
      providers: Array<{
        id: string;
        displayName: string;
        models: Array<{ id: string; displayName: string }>;
      }>;
    }
  | {
      type: "progress";
      stage: ProgressStage;
      detail?: string;
      tokensIn?: number;
      tokensOut?: number;
    }
  | { type: "log"; level: "debug" | "info" | "warn" | "error"; message: string }
  | {
      type: "result";
      ok: boolean;
      path?: string;
      reviewUrl?: string;
      summary?: string;
      message?: string;
    }
  | {
      type: "error";
      code: string;
      message: string;
      details?: Record<string, unknown>;
    };

export type ParseResult =
  | { success: true; data: Request }
  | { success: false; error: string };

export function parseRequestLine(line: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(line);
  } catch (e: unknown) {
    return { success: false, error: `Invalid JSON: ${(e as Error).message}` };
  }
  const result = requestSchema.safeParse(json);
  if (!result.success) {
    return { success: false, error: result.error.message };
  }
  return { success: true, data: result.data };
}

export type EventSink = (event: AgentEvent) => void;

const ndjsonSink: EventSink = (event) => {
  stdout.write(JSON.stringify(event) + "\n");
};

let activeSink: EventSink = ndjsonSink;

export function writeEvent(event: AgentEvent): void {
  activeSink(event);
}

/**
 * Swap the sink that `writeEvent` writes to. Returns a restore function.
 *
 * The default sink writes NDJSON to stdout (the IPC protocol used by the
 * C++ CLI). The interactive `pr-review` CLI in `cli/` swaps it for a
 * pretty TTY renderer.
 */
export function setEventSink(sink: EventSink): () => void {
  const previous = activeSink;
  activeSink = sink;
  return () => {
    activeSink = previous;
  };
}

export function resetEventSink(): void {
  activeSink = ndjsonSink;
}
