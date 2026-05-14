import type { Skill } from "../types.js";

export class ReviewSynthesisSkill implements Skill {
  readonly id             = "review-synthesis";
  readonly displayName    = "Review synthesis";
  readonly description    = "Final pass that produces the summary, risk level, and follow-up tasks from the completed comment list. Works with intent-analysis and inline-reviewer.";
  readonly stage          = ["review"] as const;
  readonly addedInVersion = "0.2.0";
  readonly pipelineStage  = "synthesis" as const;

  toSystemPromptBlock(): string {
    return `## Review synthesis pass
You have been given the PR intent document and the full list of review comments already found.
Your only job is to produce: summary, riskLevel, and followUps.
Do NOT add, remove, or modify any comments.
Return: { "summary": "...", "riskLevel": "low|medium|high", "followUps": [...] }`;
  }
}