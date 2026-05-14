import type { Skill } from "../types.js";
import { PLANNER_SYSTEM } from "../../pipeline/sow-project/prompts.js";

export class DeliveryPlannerSkill implements Skill {
  readonly id = "delivery-planner";
  readonly displayName = "Delivery Planner";
  readonly description =
    "Agent 3/5 in the SOW → ClickUp pipeline. Organises the blueprint into 3–5 delivery phases with 3–8 epics per phase, ordered by dependency and risk.";
  readonly stage = ["task-extract"] as const;
  readonly addedInVersion = "0.6.0";

  toSystemPromptBlock(): string {
    return PLANNER_SYSTEM;
  }
}
