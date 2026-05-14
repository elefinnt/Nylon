import { DeliveryPlannerSkill } from "./built-in/delivery-planner.js";
import { InlineReviewerSkill } from "./built-in/inline-reviewer.js";
import { IntentAnalysisSkill } from "./built-in/intent-analysis.js";
import { QualityDeduplicatorSkill } from "./built-in/quality-deduplicator.js";
import { ReviewSynthesisSkill } from "./built-in/review-synthesis.js";
import { SolutionArchitectSkill } from "./built-in/solution-architect.js";
import { SowIntelligenceSkill } from "./built-in/sow-intelligence.js";
import { TicketGeneratorSkill } from "./built-in/ticket-generator.js";
import { Skill } from "./types.js";

export const CATALOGUE: readonly Skill[] = [
  // ── Review pipeline ──
  new IntentAnalysisSkill(),
  new InlineReviewerSkill(),
  new ReviewSynthesisSkill(),
  // ── SOW → ClickUp pipeline (always runs in this order) ──
  new SowIntelligenceSkill(),
  new SolutionArchitectSkill(),
  new DeliveryPlannerSkill(),
  new TicketGeneratorSkill(),
  new QualityDeduplicatorSkill(),
];
