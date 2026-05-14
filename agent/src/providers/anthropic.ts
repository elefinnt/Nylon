import Anthropic from "@anthropic-ai/sdk";

import type {
  AiProvider,
  ModelDescriptor,
  ProviderRunContext,
  ReviewInput,
  ReviewOutput,
} from "./types.js";
import { buildUserPrompt, loadSystemPrompt } from "./prompts/user.js";
import { extractReviewJson } from "./json.js";
import { AgentError } from "../util/errors.js";

const MAX_TOKENS = 8_000;

export class AnthropicProvider implements AiProvider {
  readonly id = "anthropic";
  readonly displayName = "Anthropic Claude";
  readonly models: readonly ModelDescriptor[] = [
    { id: "claude-opus-4.5", displayName: "Claude Opus 4.5", contextTokens: 200_000 },
    { id: "claude-sonnet-4.5", displayName: "Claude Sonnet 4.5", contextTokens: 200_000 },
    { id: "claude-haiku-4.5", displayName: "Claude Haiku 4.5", contextTokens: 200_000 },
  ];

  async review(input: ReviewInput, ctx: ProviderRunContext): Promise<ReviewOutput> {
    if (!ctx.apiKey) {
      throw new AgentError(
        "PROVIDER_MISSING_KEY",
        "providers.anthropic.api_key is not set. Run `pr-review init` and add an Anthropic API key.",
      );
    }
    const client = new Anthropic({ apiKey: ctx.apiKey, baseURL: ctx.baseUrl });

    const system = loadSystemPrompt(ctx.skills);
    const user = buildUserPrompt(input.pr);

    ctx.onProgress("requesting completion", { in: estimateTokens(system + user) });

    let attempt = 0;
    let lastErrorPreview: string | undefined;
    while (attempt < 2) {
      attempt++;
      const text = await this.stream(client, ctx, system, attempt === 2 ? this.retryUser(user, lastErrorPreview) : user);
      try {
        return extractReviewJson(text);
      } catch (err: unknown) {
        if (err instanceof AgentError && err.code.startsWith("MODEL_") && attempt < 2) {
          lastErrorPreview = err.message;
          ctx.onLog("warn", `Anthropic output rejected (${err.code}); retrying with stricter instructions.`);
          continue;
        }
        throw err;
      }
    }
    throw new AgentError("PROVIDER_GAVE_UP", "Anthropic did not return a valid review after retries.");
  }

  private async stream(
    client: Anthropic,
    ctx: ProviderRunContext,
    system: string,
    user: string,
  ): Promise<string> {
    let collected = "";
    let tokensIn = 0;
    let tokensOut = 0;

    try {
      const stream = client.messages.stream({
        model: ctx.model,
        max_tokens: MAX_TOKENS,
        system,
        messages: [{ role: "user", content: user }],
      });

      stream.on("text", (delta) => {
        collected += delta;
        tokensOut += estimateTokens(delta);
        ctx.onProgress("streaming", { in: tokensIn, out: tokensOut });
      });

      const final = await stream.finalMessage();
      tokensIn = final.usage?.input_tokens ?? tokensIn;
      tokensOut = final.usage?.output_tokens ?? tokensOut;
      ctx.onProgress("completed", { in: tokensIn, out: tokensOut });
      return collected || finalText(final);
    } catch (err: unknown) {
      throw new AgentError(
        "PROVIDER_REQUEST_FAILED",
        `Anthropic request failed: ${(err as Error).message}`,
      );
    }
  }

  private retryUser(user: string, error?: string): string {
    return [
      "Your previous response did not match the required JSON schema:",
      error ?? "(no details)",
      "",
      "Try again. Return ONLY the JSON object, with no prose or code fences.",
      "",
      user,
    ].join("\n");
  }
}

function finalText(message: Anthropic.Messages.Message): string {
  return message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");
}

function estimateTokens(text: string): number {
  // Cheap, deterministic estimate so progress numbers move during streaming.
  return Math.ceil(text.length / 4);
}
