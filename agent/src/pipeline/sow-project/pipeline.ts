import type { z } from "zod";

import type { DocumentChunk } from "../../integrations/source/readers/types.js";
import { AgentError } from "../../util/errors.js";

import { parseJsonWithSchema } from "./json.js";
import {
  ARCHITECT_SYSTEM,
  INTELLIGENCE_SYSTEM,
  PLANNER_SYSTEM,
  QUALITY_SYSTEM,
  TICKETS_SYSTEM,
  buildArchitectUser,
  buildIntelligenceUser,
  buildPlannerUser,
  buildQualityUser,
  buildTicketsUser,
} from "./prompts.js";
import {
  deliveryStructureSchema,
  projectBlueprintSchema,
  projectUnderstandingSchema,
  ticketTreeSchema,
  type DeliveryStructure,
  type ProjectBlueprint,
  type ProjectUnderstanding,
  type TicketTree,
} from "./types.js";

/** Callback the pipeline uses to send a single prompt to the model. */
export type RunPrompt = (args: {
  system: string;
  user: string;
  stage: PipelineStage;
}) => Promise<string>;

export type PipelineStage =
  | "intelligence"
  | "architecture"
  | "planning"
  | "tickets"
  | "quality";

export const STAGE_ORDER: readonly PipelineStage[] = [
  "intelligence",
  "architecture",
  "planning",
  "tickets",
  "quality",
];

export const STAGE_LABELS: Record<PipelineStage, string> = {
  intelligence: "SOW Intelligence Extractor",
  architecture: "Solution Architect",
  planning: "Delivery Planner",
  tickets: "Ticket Generator",
  quality: "Quality & Deduplication",
};

export interface PipelineCallbacks {
  /** Fires when a stage starts (before the model call). */
  onStageStart?(stage: PipelineStage, label: string, index: number, total: number): void;
  /** Fires when a stage finishes with its parsed output. */
  onStageEnd?(stage: PipelineStage, result: PipelineStageResult): void;
  /** Fires when a stage fails. */
  onStageError?(stage: PipelineStage, err: Error): void;
}

export interface PipelineStageResult {
  stage: PipelineStage;
  /** Lightweight count to render in progress UI ("12 modules", "34 tasks", …). */
  summary: string;
}

export interface PipelineRunArgs {
  sourcePath: string;
  chunks: ReadonlyArray<DocumentChunk>;
  maxCharsPerDoc: number;
  runPrompt: RunPrompt;
  callbacks?: PipelineCallbacks;
}

/**
 * Runs the 5-agent SOW → ClickUp pipeline. Each stage feeds the next.
 * Returns the cleaned ticket tree from the quality agent.
 */
export async function runSowProjectPipeline(
  args: PipelineRunArgs,
): Promise<TicketTree> {
  const total = STAGE_ORDER.length;
  const cb = args.callbacks;

  // ── Stage 1: Intelligence ──────────────────────────────────────────
  emitStart(cb, "intelligence", 1, total);
  const understanding: ProjectUnderstanding = await runStage({
    stage: "intelligence",
    system: INTELLIGENCE_SYSTEM,
    user: buildIntelligenceUser(args.sourcePath, args.chunks, args.maxCharsPerDoc),
    schema: projectUnderstandingSchema,
    runPrompt: args.runPrompt,
    onError: (err) => cb?.onStageError?.("intelligence", err),
  });
  emitEnd(cb, {
    stage: "intelligence",
    summary:
      `${understanding.functionalAreas.length} functional area` +
      `${understanding.functionalAreas.length === 1 ? "" : "s"} · ` +
      `${understanding.integrations.length} integration` +
      `${understanding.integrations.length === 1 ? "" : "s"}`,
  });

  // ── Stage 2: Architecture ──────────────────────────────────────────
  emitStart(cb, "architecture", 2, total);
  const blueprint: ProjectBlueprint = await runStage({
    stage: "architecture",
    system: ARCHITECT_SYSTEM,
    user: buildArchitectUser(understanding),
    schema: projectBlueprintSchema,
    runPrompt: args.runPrompt,
    onError: (err) => cb?.onStageError?.("architecture", err),
  });
  emitEnd(cb, {
    stage: "architecture",
    summary: `${blueprint.modules.length} module${blueprint.modules.length === 1 ? "" : "s"}`,
  });

  // ── Stage 3: Planning ──────────────────────────────────────────────
  emitStart(cb, "planning", 3, total);
  const delivery: DeliveryStructure = await runStage({
    stage: "planning",
    system: PLANNER_SYSTEM,
    user: buildPlannerUser(understanding, blueprint),
    schema: deliveryStructureSchema,
    runPrompt: args.runPrompt,
    onError: (err) => cb?.onStageError?.("planning", err),
  });
  emitEnd(cb, {
    stage: "planning",
    summary:
      `${delivery.phases.length} phase${delivery.phases.length === 1 ? "" : "s"} · ` +
      `${countEpics(delivery)} epic${countEpics(delivery) === 1 ? "" : "s"}`,
  });

  // ── Stage 4: Tickets ───────────────────────────────────────────────
  emitStart(cb, "tickets", 4, total);
  const draftTree: TicketTree = await runStage({
    stage: "tickets",
    system: TICKETS_SYSTEM,
    user: buildTicketsUser(understanding, blueprint, delivery),
    schema: ticketTreeSchema,
    runPrompt: args.runPrompt,
    onError: (err) => cb?.onStageError?.("tickets", err),
  });
  const draftCount = countTasks(draftTree);
  emitEnd(cb, {
    stage: "tickets",
    summary: `${draftCount} draft task${draftCount === 1 ? "" : "s"}`,
  });

  // ── Stage 5: Quality + Dedup ───────────────────────────────────────
  emitStart(cb, "quality", 5, total);
  const finalTree: TicketTree = await runStage({
    stage: "quality",
    system: QUALITY_SYSTEM,
    user: buildQualityUser(draftTree),
    schema: ticketTreeSchema,
    runPrompt: args.runPrompt,
    onError: (err) => cb?.onStageError?.("quality", err),
  });
  const finalCount = countTasks(finalTree);
  emitEnd(cb, {
    stage: "quality",
    summary:
      `${finalCount} final task${finalCount === 1 ? "" : "s"} ` +
      `(${draftCount - finalCount >= 0 ? "−" : "+"}${Math.abs(draftCount - finalCount)} vs draft)`,
  });

  if (finalTree.phases.length === 0) {
    throw new AgentError(
      "EXTRACT_EMPTY_TREE",
      "Quality agent returned an empty ticket tree.",
    );
  }
  return finalTree;
}

interface StageArgs<S extends z.ZodTypeAny> {
  stage: PipelineStage;
  system: string;
  user: string;
  schema: S;
  runPrompt: RunPrompt;
  onError?: (err: Error) => void;
}

async function runStage<S extends z.ZodTypeAny>(args: StageArgs<S>): Promise<z.infer<S>> {
  const label = STAGE_LABELS[args.stage];
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const user =
      attempt === 1
        ? args.user
        : retryWrap(args.user, lastError?.message ?? "(no details)");
    let raw: string;
    try {
      raw = await args.runPrompt({ system: args.system, user, stage: args.stage });
    } catch (err: unknown) {
      args.onError?.(err as Error);
      throw err;
    }
    try {
      return parseJsonWithSchema(raw, args.schema, label);
    } catch (err: unknown) {
      lastError = err as Error;
      if (err instanceof AgentError && err.code.startsWith("MODEL_") && attempt < 2) {
        continue;
      }
      args.onError?.(err as Error);
      throw err;
    }
  }
  throw new AgentError(
    "PIPELINE_STAGE_FAILED",
    `${label} did not return valid JSON after retries: ${lastError?.message ?? ""}`,
  );
}

function retryWrap(user: string, errorPreview: string): string {
  return [
    "Your previous response did not match the required JSON schema:",
    errorPreview,
    "",
    "Try again. Return ONLY the JSON object described above, with no prose,",
    "no markdown fences, and no comments.",
    "",
    user,
  ].join("\n");
}

function emitStart(
  cb: PipelineCallbacks | undefined,
  stage: PipelineStage,
  index: number,
  total: number,
): void {
  cb?.onStageStart?.(stage, STAGE_LABELS[stage], index, total);
}

function emitEnd(cb: PipelineCallbacks | undefined, result: PipelineStageResult): void {
  cb?.onStageEnd?.(result.stage, result);
}

function countEpics(d: DeliveryStructure): number {
  return d.phases.reduce((n, p) => n + p.epics.length, 0);
}

function countTasks(tree: TicketTree): number {
  return tree.phases.reduce(
    (n, p) => n + p.epics.reduce((m, e) => m + e.tasks.length, 0),
    0,
  );
}
