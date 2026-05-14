import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { hasPipelineSkills } from "../skills/registry.js";
import {
  buildIntentPrompt,
  buildInlineReviewPrompt,
  buildSynthesisPrompt,
  extractInlineReview,
  extractSynthesis,
} from "./prompts/pipeline.js";

import { Agent, CursorAgentError } from "@cursor/sdk";

import type {
  AiProvider,
  ModelDescriptor,
  ProviderRunContext,
  ReviewInput,
  ReviewOutput,
  RunPromptArgs,
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
    const cwd = mkdtempSync(join(tmpdir(), "nylon-cursor-"));
    try {
      if (hasPipelineSkills(ctx.skills)) {
        return await this.runPipeline(input, ctx, cwd);
      }
      return await this.runSinglePass(input, ctx, cwd);
    } finally {
      try { rmSync(cwd, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
  }

  async runPrompt(args: RunPromptArgs, ctx: ProviderRunContext): Promise<string> {
    const cwd = mkdtempSync(join(tmpdir(), "nylon-cursor-"));
    try {
      const label = args.stageLabel ? `${args.stageLabel}: ` : "";
      ctx.onProgress(`${label}launching cursor agent`);
      const prompt = `${CURSOR_PREAMBLE}${args.system}\n\n---\n\n${args.user}`;
      return await this.runOnce({ ctx, cwd, prompt });
    } finally {
      try { rmSync(cwd, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
  }

  private async runSinglePass(
    input: ReviewInput,
    ctx: ProviderRunContext,
    cwd: string,
  ): Promise<ReviewOutput> {
    const system = loadSystemPrompt(ctx.skills);
    const user   = buildUserPrompt(input.pr);
    const prompt = `${CURSOR_PREAMBLE}${system}\n\n---\n\n${user}`;
    ctx.onProgress("launching cursor agent (single pass)");

    let attempt = 0;
    let lastErrorPreview: string | undefined;
    while (attempt < 2) {
      attempt++;
      const text = await this.runOnce({
        ctx,
        cwd,
        prompt: attempt === 2 ? retryPrompt(prompt, lastErrorPreview) : prompt,
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
    throw new AgentError("PROVIDER_GAVE_UP", "Cursor did not return a valid review after retries.");
  }

  private async runPipeline(
    input: ReviewInput,
    ctx: ProviderRunContext,
    cwd: string,
  ): Promise<ReviewOutput> {
    const intentSkill    = ctx.skills.find(s => s.pipelineStage === "intent")!;
    const inlineSkill    = ctx.skills.find(s => s.pipelineStage === "inline-review")!;
    const synthesisSkill = ctx.skills.find(s => s.pipelineStage === "synthesis")!;

    ctx.onProgress("pass 1/3: intent analysis");
    const intentPrompt = `${CURSOR_PREAMBLE}${intentSkill.toSystemPromptBlock()}\n\n---\n\n${buildIntentPrompt(input.pr)}`;
    const intentText   = await this.runOnce({ ctx, cwd, prompt: intentPrompt });

    ctx.onProgress("pass 2/3: inline review");
    const inlineSystem = `${CURSOR_PREAMBLE}${inlineSkill.toSystemPromptBlock()}`;
    const inlineUser   = buildInlineReviewPrompt(input.pr, intentText);
    const inlineText   = await this.runOnce({ ctx, cwd, prompt: `${inlineSystem}\n\n---\n\n${inlineUser}` });
    const { comments } = extractInlineReview(inlineText);

    ctx.onProgress("pass 3/3: synthesis");
    const synthSystem = `${CURSOR_PREAMBLE}${synthesisSkill.toSystemPromptBlock()}`;
    const synthUser   = buildSynthesisPrompt(intentText, comments);
    const synthText   = await this.runOnce({ ctx, cwd, prompt: `${synthSystem}\n\n---\n\n${synthUser}` });
    const { summary, riskLevel, followUps } = extractSynthesis(synthText);

    return { summary, riskLevel, comments, followUps };
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
}

function retryPrompt(prompt: string, error?: string): string {
  return [
    "Your previous response did not match the required JSON schema:",
    error ?? "(no details)",
    "",
    "Try again. Return ONLY the JSON object, with no prose or code fences.",
    "",
    prompt,
  ].join("\n");
}
