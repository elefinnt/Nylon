import type { ReviewRequest } from "../protocol.js";
import { writeEvent } from "../protocol.js";
import { loadConfig } from "../config.js";
import { createOctokit } from "../github/client.js";
import { fetchPullRequest, summariseFiles } from "../github/pr.js";
import { postReview } from "../github/review.js";
import { getProvider } from "../providers/registry.js";
import type { ProviderRunContext } from "../providers/types.js";
import { chunk } from "./chunker.js";
import { parsePrUrl } from "./url.js";
import { AgentError, toAgentError } from "../util/errors.js";
import { logger } from "../util/log.js";

export async function runReview(request: ReviewRequest): Promise<void> {
  try {
    writeEvent({ type: "progress", stage: "startup", detail: "Agent online" });

    writeEvent({ type: "progress", stage: "loadingConfig" });
    const config = loadConfig();

    const provider = getProvider(request.provider);
    const providerCfg = config.providers[provider.id];
    const apiKey = providerCfg?.api_key;
    if (!apiKey) {
      throw new AgentError(
        "PROVIDER_NOT_CONFIGURED",
        `providers.${provider.id}.api_key is missing in ${config.sourcePath}.`,
      );
    }
    const modelId = request.model || providerCfg.default_model || provider.models[0]?.id;
    if (!modelId) {
      throw new AgentError("PROVIDER_NO_MODEL", `No model configured for ${provider.id}.`);
    }

    const parsed = parsePrUrl(request.url);

    writeEvent({ type: "progress", stage: "fetching", detail: `${parsed.owner}/${parsed.repo}#${parsed.number}` });
    const octokit = createOctokit({ token: config.github.token });
    const fullPr = await fetchPullRequest(octokit, parsed);
    writeEvent({ type: "progress", stage: "fetching", detail: summariseFiles(fullPr.files) });

    writeEvent({ type: "progress", stage: "chunking", detail: `${fullPr.unifiedDiff.length} chars of diff` });
    const pr = chunk(fullPr);

    writeEvent({
      type: "progress",
      stage: "reviewing",
      detail: `${provider.displayName} (${modelId})`,
    });
    const ctx: ProviderRunContext = {
      apiKey,
      model: modelId,
      baseUrl: providerCfg.base_url ?? undefined,
      onProgress: (detail, tokens) =>
        writeEvent({
          type: "progress",
          stage: "reviewing",
          detail,
          ...(tokens?.in !== undefined ? { tokensIn: tokens.in } : {}),
          ...(tokens?.out !== undefined ? { tokensOut: tokens.out } : {}),
        }),
      onLog: (level, message) => writeEvent({ type: "log", level, message }),
    };
    const reviewOutput = await provider.review({ pr }, ctx);

    if (!request.postReview) {
      writeEvent({ type: "progress", stage: "posting", detail: "skipped (dry run)" });
      writeEvent({
        type: "result",
        ok: true,
        summary: reviewOutput.summary,
        message: "Dry run complete; review not posted.",
      });
      return;
    }

    writeEvent({ type: "progress", stage: "posting", detail: `${reviewOutput.comments.length} inline comments` });
    const posted = await postReview(octokit, {
      parsed,
      pr,
      output: reviewOutput,
      providerId: provider.id,
      modelId,
    });

    writeEvent({
      type: "progress",
      stage: "done",
      detail: `${posted.postedComments} posted / ${posted.droppedComments} folded into summary`,
    });
    writeEvent({
      type: "result",
      ok: true,
      reviewUrl: posted.reviewUrl,
      summary: reviewOutput.summary,
    });
  } catch (err: unknown) {
    const e = toAgentError(err);
    logger.error({ err: e, code: e.code }, "Review pipeline failed");
    writeEvent({ type: "error", code: e.code, message: e.message, details: e.details });
  }
}
