import { stderr, stdout } from "node:process";

import type { AgentEvent, ProgressStage } from "../protocol.js";
import { Spinner } from "./spinner.js";

const useColour = stdout.isTTY && !process.env["NO_COLOR"];

function wrap(open: string, close: string) {
  return (s: string): string => (useColour ? `\u001b[${open}m${s}\u001b[${close}m` : s);
}

export const paint = {
  dim: wrap("2", "22"),
  bold: wrap("1", "22"),
  red: wrap("31", "39"),
  green: wrap("32", "39"),
  yellow: wrap("33", "39"),
  blue: wrap("34", "39"),
  cyan: wrap("36", "39"),
  warn: wrap("33", "39"),
};

const STAGE_LABEL: Record<ProgressStage, string> = {
  startup: "Starting",
  loadingConfig: "Loading config",
  fetching: "Fetching PR",
  chunking: "Preparing diff",
  reviewing: "Reviewing",
  posting: "Posting review",
  done: "Done",
};

export interface RenderOptions {
  verbose?: boolean;
}

/**
 * Renders agent events as a slick TTY experience: one animated spinner
 * per pipeline stage, with sub-progress (file count, token totals, etc.)
 * shown inline. Falls back to plain prints when the spinner is disabled
 * (non-TTY, NO_COLOR, CI, ...).
 */
export class CliRenderer {
  private readonly spinner = new Spinner();
  private currentStage: ProgressStage | undefined;
  private currentLabel = "";

  constructor(private readonly opts: RenderOptions = {}) {}

  handle(event: AgentEvent): void {
    switch (event.type) {
      case "progress":
        this.handleProgress(event);
        return;
      case "log":
        if (event.level === "debug" && !this.opts.verbose) return;
        this.withSpinnerPaused(() => this.renderLog(event.level, event.message));
        return;
      case "result":
        this.renderResult(event);
        return;
      case "error":
        this.renderError(event);
        return;
      case "providers":
      case "pong":
        return;
    }
  }

  /** Stop any in-flight spinner. Call this before exiting. */
  finish(): void {
    if (this.currentStage !== undefined) {
      this.spinner.stop();
      this.currentStage = undefined;
    }
  }

  private handleProgress(event: Extract<AgentEvent, { type: "progress" }>): void {
    const text = composeText(event.stage, event.detail, event.tokensIn, event.tokensOut);

    if (event.stage === "done") {
      this.spinner.succeed(text);
      this.currentStage = undefined;
      return;
    }

    if (this.currentStage !== event.stage) {
      if (this.currentStage !== undefined) {
        this.spinner.succeed(this.currentLabel);
      }
      this.currentStage = event.stage;
      this.currentLabel = text;
      this.spinner.start(text);
      return;
    }

    this.currentLabel = text;
    this.spinner.update(text);
  }

  private renderLog(level: "debug" | "info" | "warn" | "error", message: string): void {
    const tag =
      level === "error"
        ? paint.red("error")
        : level === "warn"
          ? paint.yellow("warn ")
          : level === "info"
            ? paint.blue("info ")
            : paint.dim("debug");
    stderr.write(`  ${tag} ${message}\n`);
  }

  private renderResult(event: Extract<AgentEvent, { type: "result" }>): void {
    if (this.currentStage !== undefined) {
      this.spinner.succeed(this.currentLabel);
      this.currentStage = undefined;
    }
    if (!event.ok) {
      stdout.write(`${paint.red("\u2717")} ${event.message ?? "Failed"}\n`);
      return;
    }
    if (event.reviewUrl) {
      stdout.write(`\n${paint.green("\u2713")} Review posted\n`);
      stdout.write(`  ${paint.bold(event.reviewUrl)}\n`);
    } else if (event.path) {
      stdout.write(`${paint.green("\u2713")} Wrote ${paint.bold(event.path)}\n`);
    } else if (event.message) {
      stdout.write(`${paint.green("\u2713")} ${event.message}\n`);
    }
    if (event.summary) {
      stdout.write(`\n${paint.bold("Summary")}\n`);
      for (const line of event.summary.split(/\r?\n/)) {
        stdout.write(`  ${line}\n`);
      }
    }
  }

  private renderError(event: Extract<AgentEvent, { type: "error" }>): void {
    if (this.currentStage !== undefined) {
      this.spinner.fail(this.currentLabel);
      this.currentStage = undefined;
    }
    stdout.write(`${paint.red("\u2717")} ${paint.bold(event.code)}: ${event.message}\n`);
    if (this.opts.verbose && event.details) {
      stderr.write(`  ${paint.dim(JSON.stringify(event.details))}\n`);
    }
  }

  private withSpinnerPaused(write: () => void): void {
    const wasActive = this.currentStage !== undefined;
    if (wasActive) this.spinner.pause();
    write();
    if (wasActive) this.spinner.resume();
  }
}

function composeText(
  stage: ProgressStage,
  detail: string | undefined,
  tokensIn: number | undefined,
  tokensOut: number | undefined,
): string {
  const label = STAGE_LABEL[stage];
  const tokenInfo =
    tokensIn !== undefined || tokensOut !== undefined
      ? paint.dim(` (in:${tokensIn ?? 0} out:${tokensOut ?? 0})`)
      : "";
  const detailText = detail ? paint.dim(` - ${detail}`) : "";
  return `${paint.bold(label)}${detailText}${tokenInfo}`;
}
