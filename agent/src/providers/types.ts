import { z } from "zod";

export const reviewCommentSchema = z.object({
  path: z.string().min(1),
  line: z.number().int().positive(),
  side: z.enum(["LEFT", "RIGHT"]).default("RIGHT"),
  body: z.string().min(1),
  severity: z.enum(["info", "suggestion", "warning", "issue"]).default("suggestion"),
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

export interface AiProvider {
  readonly id: string;
  readonly displayName: string;
  readonly models: readonly ModelDescriptor[];

  review(input: ReviewInput, ctx: ProviderRunContext): Promise<ReviewOutput>;
}
