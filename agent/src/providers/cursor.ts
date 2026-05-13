import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Agent, CursorAgentError } from "@cursor/sdk";

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

const CURSOR_PREAMBLE = [
  "You are running as an automated reviewer inside a Cursor agent.",
  "The full pull-request diff is included in this message. There is no",
  "checked-out source tree; do NOT attempt to read or list files. Just",
  "produce the JSON review described below.",
  "",
].join("\n");

export class CursorProvider implements AiProvider {
  readonly id = "cursor";
  readonly displayName = "Cursor (Pro+)";
  readonly models: readonly ModelDescriptor[] = [
    { id: "composer-2", displayName: "Composer 2 (default)" },
    { id: "auto", displayName: "Auto (server picks)" },
  ];

  async review(input: ReviewInput, ctx: ProviderRunContext): Promise<ReviewOutput> {
    const system = loadSystemPrompt();
    const user = buildUserPrompt(input.pr);
    const prompt = `${CURSOR_PREAMBLE}${system}\n\n---\n\n${user}`;

    const cwd = mkdtempSync(join(tmpdir(), "pr-agent-cursor-"));
    ctx.onProgress("launching cursor agent");
    try {
      let attempt = 0;
      let lastErrorPreview: string | undefined;
      while (attempt < 2) {
        attempt++;
        const text = await this.runOnce({
          ctx,
          cwd,
          prompt: attempt === 2 ? this.retryPrompt(prompt, lastErrorPreview) : prompt,
        });
        try {
          return extractReviewJson(text);
        } catch (err: unknown) {
          if (err instanceof AgentError && err.code.startsWith("MODEL_") && attempt < 2) {
            lastErrorPreview = err.message;
            ctx.onLog("warn", `Cursor output rejected (${err.code}); retrying.`);
            continue;
          }
          throw err;
        }
      }
      throw new AgentError(
        "PROVIDER_GAVE_UP",
        "Cursor did not return a valid review after retries.",
      );
    } finally {
      try {
        rmSync(cwd, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup of the scratch dir.
      }
    }
  }

  private async runOnce(args: {
    ctx: ProviderRunContext;
    cwd: string;
    prompt: string;
  }): Promise<string> {
    const { ctx, cwd, prompt } = args;
    try {
      const result = await Agent.prompt(prompt, {
        apiKey: ctx.apiKey,
        model: { id: ctx.model },
        local: { cwd },
      });
      if (result.status !== "finished") {
        throw new AgentError(
          "PROVIDER_REQUEST_FAILED",
          `Cursor agent did not finish (status=${result.status}).`,
        );
      }
      ctx.onProgress("agent finished");
      return typeof result.result === "string" ? result.result : "";
    } catch (err: unknown) {
      if (err instanceof CursorAgentError) {
        throw new AgentError(
          "PROVIDER_STARTUP_FAILED",
          `Cursor agent failed to start: ${err.message}${err.isRetryable ? " (retryable)" : ""}`,
        );
      }
      throw err;
    }
  }

  private retryPrompt(prompt: string, error?: string): string {
    return [
      "Your previous response did not match the required JSON schema:",
      error ?? "(no details)",
      "",
      "Try again. Return ONLY the JSON object, with no prose or code fences.",
      "",
      prompt,
    ].join("\n");
  }
}
