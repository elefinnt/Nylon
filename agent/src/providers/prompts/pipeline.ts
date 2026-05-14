import { z } from "zod";
import { reviewCommentSchema } from "../types.js";
import type { PullRequestSnapshot } from "../types.js";

// ── Pass 1: intent ────────────────────────────────────────────────

export function buildIntentPrompt(pr: PullRequestSnapshot): string {
  const files = pr.files
    .map(f => `- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`)
    .join("\n");

  return [
    `Pull request: ${pr.owner}/${pr.repo}#${pr.number}`,
    `Title: ${pr.title}`,
    "",
    "Author description:",
    pr.body.trim() || "(no description)",
    "",
    `Changed files (${pr.files.length}):`,
    files,
    "",
    "Describe the intent of this PR as instructed in the system prompt.",
  ].join("\n");
}

// ── Pass 2: inline comments ───────────────────────────────────────

const inlineReviewSchema = z.object({
  comments: z.array(reviewCommentSchema).default([]),
});

export type InlineReviewOutput = z.infer<typeof inlineReviewSchema>;

export function buildInlineReviewPrompt(
  pr: PullRequestSnapshot,
  intent: string,
  maxDiffChars = 180_000,
): string {
  const diff =
    pr.unifiedDiff.length > maxDiffChars
      ? pr.unifiedDiff.slice(0, maxDiffChars) +
        `\n... [diff truncated at ${maxDiffChars} chars] ...`
      : pr.unifiedDiff;

  return [
    "## PR intent",
    intent,
    "",
    "## Unified diff",
    "```diff",
    diff,
    "```",
    "",
    'Return { "comments": [...] } as instructed.',
  ].join("\n");
}

export function extractInlineReview(raw: string): InlineReviewOutput {
  const json = extractFirstObject(raw);
  if (!json) throw new Error("No JSON object found in inline-review output.");
  const result = inlineReviewSchema.safeParse(JSON.parse(json));
  if (!result.success) throw new Error(`Inline-review schema mismatch: ${result.error.message}`);
  return result.data;
}

// ── Pass 3: synthesis ─────────────────────────────────────────────

const synthesisSchema = z.object({
  summary:   z.string().min(1),
  riskLevel: z.enum(["low", "medium", "high"]).default("medium"),
  followUps: z.array(z.string()).default([]),
});

export type SynthesisOutput = z.infer<typeof synthesisSchema>;

export function buildSynthesisPrompt(
  intent: string,
  comments: InlineReviewOutput["comments"],
): string {
  return [
    "## PR intent",
    intent,
    "",
    "## Review comments found",
    JSON.stringify(comments, null, 2),
    "",
    'Return { "summary": "...", "riskLevel": "...", "followUps": [...] } as instructed.',
  ].join("\n");
}

export function extractSynthesis(raw: string): SynthesisOutput {
  const json = extractFirstObject(raw);
  if (!json) throw new Error("No JSON object found in synthesis output.");
  const result = synthesisSchema.safeParse(JSON.parse(json));
  if (!result.success) throw new Error(`Synthesis schema mismatch: ${result.error.message}`);
  return result.data;
}

// ── shared util ───────────────────────────────────────────────────

function extractFirstObject(text: string): string | null {
  let depth = 0, start = -1, inString = false, escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) { escape = false; }
      else if (ch === "\\") { escape = true; }
      else if (ch === '"') { inString = false; }
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") { if (depth === 0) start = i; depth++; }
    else if (ch === "}") { depth--; if (depth === 0 && start !== -1) return text.slice(start, i + 1); }
  }
  return null;
}