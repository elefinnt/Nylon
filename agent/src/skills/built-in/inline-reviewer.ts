import type { Skill } from "../types.js";

export class InlineReviewerSkill implements Skill {
  readonly id = "inline-reviewer";
  readonly displayName = "Inline reviewer";
  readonly description =
    "Focused diff-review pass that produces only inline comments. Works with intent-analysis and review-synthesis to form the full 3-pass pipeline.";
  readonly stage = ["review"] as const;
  readonly addedInVersion = "0.2.0";
  readonly pipelineStage = "inline-review" as const;

  toSystemPromptBlock(): string {
    return `## Inline review pass
You have been given an intent document describing what this PR is trying to accomplish, plus the unified diff.
Your only job is to produce the \`comments\` array. Do NOT write a summary, risk level, or follow-ups — those come from a separate pass.
Focus: correctness, security, data integrity, error handling, missing tests, API breakage.

Each comment shape:
{
  "path": string,            // file path exactly as it appears in the diff
  "line": number,            // 1-indexed line on the RIGHT side of the diff (required, integer, never null)
  "side": "RIGHT" | "LEFT",  // default "RIGHT"
  "body": string,            // markdown, one short paragraph
  "severity": "info" | "suggestion" | "warning" | "issue"
}

Severity MUST be exactly one of those four values. Map common terms: nit/nitpick/minor/style → "suggestion"; praise/question/note → "info"; warn/important → "warning"; bug/blocker/critical → "issue". Never invent other severities.
If a comment cannot be tied to a single diff line, omit it entirely — the synthesis pass will handle PR-level feedback.

Return a JSON object with a single key: { "comments": [...] }`;
  }
}
