import type { Skill } from "../types.js";
import { INTELLIGENCE_SYSTEM } from "../../pipeline/sow-project/prompts.js";

export class SowIntelligenceSkill implements Skill {
  readonly id = "sow-intelligence";
  readonly displayName = "SOW Intelligence Extractor";
  readonly description =
    "Agent 1/5 in the SOW → ClickUp pipeline. Reads the document and produces a structured project understanding (functional areas, integrations, constraints, out-of-scope).";
  readonly stage = ["task-extract"] as const;
  readonly addedInVersion = "0.6.0";

  toSystemPromptBlock(): string {
    return INTELLIGENCE_SYSTEM;
  }
}
