import { stdout } from "node:process";

import { loadConfig } from "../../config.js";
import { runReview } from "../../pipeline/orchestrator.js";
import { setEventSink } from "../../protocol.js";
import type { AgentEvent } from "../../protocol.js";
import { AgentError, toAgentError } from "../../util/errors.js";
import { CliRenderer, paint } from "../render.js";

export interface ReviewCommandInput {
  url: string;
  provider?: string;
  model?: string;
  dry: boolean;
  verbose: boolean;
}

export async function runReviewCommand(input: ReviewCommandInput): Promise<number> {
  let exitCode = 0;
  let config;
  try {
    config = loadConfig();
  } catch (err: unknown) {
    const e = toAgentError(err);
    stdout.write(
      `${paint.red("✗")} ${paint.bold(e.code)}: ${e.message}\n` +
        `  Run ${paint.bold("nylon init")} first.\n`,
    );
    return 2;
  }

  const providerId = input.provider ?? config.defaults.provider;
  if (!providerId) {
    stdout.write(
      `${paint.red("✗")} No provider given. Pass ${paint.bold("--provider <id>")}` +
        " or set [defaults].provider in your config.\n",
    );
    return 2;
  }

  const providerCfg = config.providers[providerId];
  if (!providerCfg?.api_key) {
    stdout.write(
      `${paint.red("✗")} Provider ${paint.bold(providerId)} is not configured ` +
        `in ${config.sourcePath}. Run ${paint.bold("nylon init")} again.\n`,
    );
    return 2;
  }

  const modelId =
    input.model ?? config.defaults.model ?? providerCfg.default_model ?? "";
  if (!modelId) {
    stdout.write(
      `${paint.red("✗")} No model selected for ${paint.bold(providerId)}. ` +
        `Pass ${paint.bold("--model <id>")} or set a default.\n`,
    );
    return 2;
  }

  const renderer = new CliRenderer({ verbose: input.verbose });
  const restoreSink = setEventSink((event: AgentEvent) => {
    if (event.type === "error" || (event.type === "result" && event.ok === false)) {
      exitCode = 1;
    }
    renderer.handle(event);
  });

  stdout.write(
    `${paint.bold("nylon")} ${paint.dim(input.dry ? "(dry run)" : "")}\n` +
      `  ${paint.dim("PR:        ")} ${input.url}\n` +
      `  ${paint.dim("Provider:  ")} ${providerId}\n` +
      `  ${paint.dim("Model:     ")} ${modelId}\n` +
      `\n`,
  );

  try {
    await runReview({
      type: "review",
      url: input.url,
      provider: providerId,
      model: modelId,
      postReview: input.dry ? false : config.defaults.post_review,
    });
  } catch (err: unknown) {
    const e = err instanceof AgentError ? err : toAgentError(err);
    renderer.handle({ type: "error", code: e.code, message: e.message });
    exitCode = 1;
  } finally {
    renderer.finish();
    restoreSink();
  }
  return exitCode;
}
