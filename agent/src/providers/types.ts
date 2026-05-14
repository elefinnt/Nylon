import { z } from "zod";
import type { Skill } from "../skills/types.js";

// Models drift from our four-value enum constantly (especially `nit`, which is
// a GitHub-review idiom they were trained on). Normalise common aliases instead
// of rejecting the whole review.
const SEVERITY_ALIASES: Record<string, "info" | "suggestion" | "warning" | "issue"> = {
  info: "info",
  note: "info",
  comment: "info",
  observation: "info",
  praise: "info",
  question: "info",
  clarification: "info",
  suggestion: "suggestion",
  nit: "suggestion",
  nitpick: "suggestion",
  minor: "suggestion",
  style: "suggestion",
  refactor: "suggestion",
  warning: "warning",
  warn: "warning",
  important: "warning",
  caution: "warning",
  issue: "issue",
  bug: "issue",
  error: "issue",
  blocker: "issue",
  critical: "issue",
};

const severityField = z.preprocess(
  (v) => {
    if (typeof v !== "string") return v;
    return SEVERITY_ALIASES[v.trim().toLowerCase()] ?? "suggestion";
  },
  z.enum(["info", "suggestion", "warning", "issue"]).default("suggestion"),
);

// `line` is supposed to be a positive integer on the RIGHT side of the diff,
// but models sometimes return `null`, a stringified number, `0`, or a float.
// Coerce anything we can; otherwise leave it null so the downstream renderer
// can fall back to a file-level / summary comment instead of crashing.
const lineField = z.preprocess(
  (v) => {
    if (typeof v === "string") {
      const n = parseInt(v.trim(), 10);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
    if (typeof v === "number") {
      return Number.isInteger(v) && v > 0 ? v : null;
    }
    return null;
  },
  z.number().int().positive().nullable(),
);

export const reviewCommentSchema = z.object({
  path: z.string().min(1),
  line: lineField,
  side: z.enum(["LEFT", "RIGHT"]).default("RIGHT"),
  body: z.string().min(1),
  severity: severityField,
});

export const reviewOutputSchema = z.object({
  summary: z.string().min(1),
  riskLevel: z.enum(["low", "medium", "high"]).default("medium"),
  comments: z.array(reviewCommentSchema).default([]),
  followUps: z.array(z.string()).default([]),
});

export type ReviewComment = z.infer<typeof reviewCommentSchema>;
export type ReviewOutput = z.infer<typeof reviewOutputSchema>;

export interface ModelDescriptor {
  readonly id: string;
  readonly displayName: string;
  readonly contextTokens?: number;
}

export interface ProviderRunContext {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly model: string;
  readonly skills: readonly Skill[];
  onProgress(detail: string, tokens?: { in?: number; out?: number }): void;
  onLog(level: "debug" | "info" | "warn" | "error", message: string): void;
}

export interface PullRequestSnapshot {
  readonly owner: string;
  readonly repo: string;
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly baseSha: string;
  readonly headSha: string;
  readonly files: ReadonlyArray<{
    readonly filename: string;
    readonly status: string;
    readonly additions: number;
    readonly deletions: number;
    readonly patch?: string;
  }>;
  readonly unifiedDiff: string;
}

export interface ReviewInput {
  readonly pr: PullRequestSnapshot;
}

// ── Generic prompt primitive ───────────────────────────────────────────────

export interface RunPromptArgs {
  /** System prompt — model instructions / role. */
  readonly system: string;
  /** User prompt — actual content / task. */
  readonly user: string;
  /** Optional label for progress UI (e.g. "intelligence", "tickets"). */
  readonly stageLabel?: string;
}

// ── Provider interface ─────────────────────────────────────────────────────

export interface AiProvider {
  readonly id: string;
  readonly displayName: string;
  readonly models: readonly ModelDescriptor[];

  review(input: ReviewInput, ctx: ProviderRunContext): Promise<ReviewOutput>;

  /**
   * Low-level primitive: send a single system+user prompt to the model
   * and return its raw text response. Used by multi-pass pipelines
   * (SOW → ClickUp project, etc.) that orchestrate their own JSON
   * parsing and retry logic.
   */
  runPrompt(args: RunPromptArgs, ctx: ProviderRunContext): Promise<string>;
}
