import OpenAI from "openai";

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

export class OpenAiProvider implements AiProvider {
  readonly id = "openai";
  readonly displayName = "OpenAI";
  readonly models: readonly ModelDescriptor[] = [
    { id: "gpt-5", displayName: "GPT-5", contextTokens: 400_000 },
    { id: "gpt-5-mini", displayName: "GPT-5 mini", contextTokens: 400_000 },
    { id: "o4", displayName: "o4", contextTokens: 200_000 },
  ];

  async review(input: ReviewInput, ctx: ProviderRunContext): Promise<ReviewOutput> {
    if (!ctx.apiKey) {
      throw new AgentError(
        "PROVIDER_MISSING_KEY",
        "providers.openai.api_key is not set. Run `pr-review init` and add an OpenAI API key.",
      );
    }
    const client = new OpenAI({ apiKey: ctx.apiKey, baseURL: ctx.baseUrl });

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
          ctx.onLog("warn", `OpenAI output rejected (${err.code}); retrying with stricter instructions.`);
          continue;
        }
        throw err;
      }
    }
    throw new AgentError("PROVIDER_GAVE_UP", "OpenAI did not return a valid review after retries.");
  }

  private async stream(
    client: OpenAI,
    ctx: ProviderRunContext,
    system: string,
    user: string,
  ): Promise<string> {
    let collected = "";
    let tokensOut = 0;
    const tokensIn = estimateTokens(system + user);

    try {
      const stream = await client.chat.completions.create({
        model: ctx.model,
        stream: true,
        max_completion_tokens: MAX_TOKENS,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (delta) {
          collected += delta;
          tokensOut += estimateTokens(delta);
          ctx.onProgress("streaming", { in: tokensIn, out: tokensOut });
        }
      }

      ctx.onProgress("completed", { in: tokensIn, out: tokensOut });
      return collected;
    } catch (err: unknown) {
      throw new AgentError(
        "PROVIDER_REQUEST_FAILED",
        `OpenAI request failed: ${(err as Error).message}`,
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

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
