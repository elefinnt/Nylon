import type { Skill } from "../types.js";
import { QUALITY_SYSTEM } from "../../pipeline/sow-project/prompts.js";

export class QualityDeduplicatorSkill implements Skill {
  readonly id = "quality-deduplicator";
  readonly displayName = "Quality & Deduplication";
  readonly description =
    "Agent 5/5 in the SOW → ClickUp pipeline. Final pass that merges duplicates, drops trivia, rebalances phases, and enforces the 15–40 parent task cap.";
  readonly stage = ["task-extract"] as const;
  readonly addedInVersion = "0.6.0";

  toSystemPromptBlock(): string {
    return QUALITY_SYSTEM;
  }
}
