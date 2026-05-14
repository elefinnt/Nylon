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
Return a JSON object with a single key: { "comments": [...] }`;
  }
}
