import type { Skill } from "../types.js";
import { TICKETS_SYSTEM } from "../../pipeline/sow-project/prompts.js";

export class TicketGeneratorSkill implements Skill {
  readonly id = "ticket-generator";
  readonly displayName = "Ticket Generator";
  readonly description =
    "Agent 4/5 in the SOW → ClickUp pipeline. Generates agency-style parent tasks with acceptance criteria, implementation notes, estimates, and subtasks (max 40 parents, max 8 subtasks each).";
  readonly stage = ["task-extract"] as const;
  readonly addedInVersion = "0.6.0";

  toSystemPromptBlock(): string {
    return TICKETS_SYSTEM;
  }
}
