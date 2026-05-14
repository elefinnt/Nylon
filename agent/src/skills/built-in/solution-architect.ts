import type { Skill } from "../types.js";
import { ARCHITECT_SYSTEM } from "../../pipeline/sow-project/prompts.js";

export class SolutionArchitectSkill implements Skill {
  readonly id = "solution-architect";
  readonly displayName = "Solution Architect";
  readonly description =
    "Agent 2/5 in the SOW → ClickUp pipeline. Decomposes the project understanding into architectural modules with layers, purposes, and dependencies.";
  readonly stage = ["task-extract"] as const;
  readonly addedInVersion = "0.6.0";

  toSystemPromptBlock(): string {
    return ARCHITECT_SYSTEM;
  }
}
