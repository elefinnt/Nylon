import { stdout } from "node:process";

import { loadConfig } from "../config.js";
import { readDocument } from "../integrations/source/readers/index.js";
import { getProvider } from "../providers/registry.js";
import type { ProviderRunContext } from "../providers/types.js";
import { AgentError } from "../util/errors.js";
import { logger } from "../util/log.js";
import { paint } from "../cli/render.js";
import {
  runSowProjectPipeline,
  STAGE_LABELS,
  type PipelineStage,
} from "./sow-project/pipeline.js";
import type { TicketTree } from "./sow-project/types.js";

export interface ExtractRequest {
  /** Absolute or relative path to the document to extract from. */
  sourcePath: string;
  /** Provider id override (falls back to config defaults). */
  provider?: string;
  /** Model id override. */
  model?: string;
}

/**
 * Reads a document and runs the 5-agent SOW → ClickUp pipeline:
 *
 *   1. SOW Intelligence Extractor   →  ProjectUnderstanding
 *   2. Solution Architect           →  ProjectBlueprint
 *   3. Delivery Planner             →  DeliveryStructure
 *   4. Ticket Generator             →  draft TicketTree
 *   5. Quality & Deduplication      →  final TicketTree (max 40 parents)
 *
 * Progress is written directly to stdout so the caller's CLI output
 * stays in scrollback.
 */
export async function runExtract(request: ExtractRequest): Promise<TicketTree> {
  const config = loadConfig();

  const providerId = request.provider ?? config.defaults.provider ?? "anthropic";
  const provider = getProvider(providerId);
  const providerCfg = config.providers[provider.id];
  const apiKey = providerCfg?.api_key;

  if (!apiKey) {
    throw new AgentError(
      "PROVIDER_NOT_CONFIGURED",
      `providers.${provider.id}.api_key is missing in ${config.sourcePath}.`,
    );
  }

  const modelId = request.model ?? providerCfg.default_model ?? provider.models[0]?.id;
  if (!modelId) {
    throw new AgentError("PROVIDER_NO_MODEL", `No model configured for ${provider.id}.`);
  }

  stdout.write(`  ${paint.dim("→")} Reading ${paint.bold(request.sourcePath)} …\n`);

  const pdfStrategy = config.extract?.pdf_strategy ?? "auto";
  const maxCharsPerDoc = config.extract?.max_chars_per_doc ?? 80_000;

  let chunks;
  try {
    chunks = await readDocument(request.sourcePath, {
      pdf: { strategy: pdfStrategy, maxCharsPerDoc },
    });
  } catch (err: unknown) {
    throw new AgentError(
      "EXTRACT_READ_FAILED",
      `Could not read "${request.sourcePath}": ${(err as Error).message}`,
    );
  }

  if (chunks.length === 0) {
    throw new AgentError(
      "EXTRACT_EMPTY_DOC",
      `No readable content found in "${request.sourcePath}".`,
    );
  }

  const textChunks = chunks.filter(c => c.kind === "text");
  stdout.write(
    `  ${paint.green("✓")} ${textChunks.length} chunk${textChunks.length === 1 ? "" : "s"} read` +
      ` — ${provider.displayName} (${modelId})\n`,
  );

  stdout.write(
    `\n  ${paint.bold("SOW → ClickUp pipeline")} ${paint.dim("(5 agents)")}\n`,
  );

  const ctx: ProviderRunContext = {
    apiKey,
    model: modelId,
    baseUrl: providerCfg.base_url ?? undefined,
    skills: [],
    onProgress: () => { /* per-stage progress is handled by callbacks below */ },
    onLog: (level, message) => {
      logger[level]({ source: "extract" }, message);
    },
  };

  try {
    return await runSowProjectPipeline({
      sourcePath: request.sourcePath,
      chunks,
      maxCharsPerDoc,
      runPrompt: ({ system, user, stage }) =>
        provider.runPrompt({ system, user, stageLabel: stage }, ctx),
      callbacks: {
        onStageStart: (stage, label, index, total) => {
          stdout.write(
            `  ${paint.dim(`→`)} Pass ${index}/${total}: ${paint.bold(label)}\n`,
          );
        },
        onStageEnd: (stage, result) => {
          stdout.write(
            `    ${paint.green("✓")} ${STAGE_LABELS[stage as PipelineStage]} ${paint.dim(`— ${result.summary}`)}\n`,
          );
        },
        onStageError: (stage, err) => {
          stdout.write(
            `    ${paint.red("✗")} ${STAGE_LABELS[stage as PipelineStage]}: ${paint.dim(err.message)}\n`,
          );
        },
      },
    });
  } catch (err: unknown) {
    throw err instanceof AgentError
      ? err
      : new AgentError("EXTRACT_FAILED", (err as Error).message);
  }
}
