import { stderr, stdout } from "node:process";

import type { AgentEvent, ProgressStage } from "../protocol.js";

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

export class CliRenderer {
  private lastStage: ProgressStage | undefined;

  constructor(private readonly opts: RenderOptions = {}) {}

  handle(event: AgentEvent): void {
    switch (event.type) {
      case "progress":
        this.renderProgress(event.stage, event.detail, event.tokensIn, event.tokensOut);
        return;
      case "log":
        if (event.level === "debug" && !this.opts.verbose) return;
        this.renderLog(event.level, event.message);
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

  private renderProgress(
    stage: ProgressStage,
    detail: string | undefined,
    tokensIn: number | undefined,
    tokensOut: number | undefined,
  ): void {
    const label = STAGE_LABEL[stage];
    const tokenInfo =
      tokensIn !== undefined || tokensOut !== undefined
        ? paint.dim(` (in:${tokensIn ?? 0} out:${tokensOut ?? 0})`)
        : "";
    const detailText = detail ? paint.dim(` - ${detail}`) : "";

    if (this.lastStage !== stage) {
      stdout.write(`${paint.cyan("•")} ${paint.bold(label)}${detailText}${tokenInfo}\n`);
      this.lastStage = stage;
      return;
    }
    if (detail || tokenInfo) {
      stdout.write(`  ${paint.dim("·")} ${(detail ?? "").trim()}${tokenInfo}\n`);
    }
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
    if (!event.ok) {
      stdout.write(`${paint.red("✗")} ${event.message ?? "Failed"}\n`);
      return;
    }
    if (event.reviewUrl) {
      stdout.write(`\n${paint.green("✓")} Review posted\n`);
      stdout.write(`  ${paint.bold(event.reviewUrl)}\n`);
    } else if (event.path) {
      stdout.write(`${paint.green("✓")} Wrote ${paint.bold(event.path)}\n`);
    } else if (event.message) {
      stdout.write(`${paint.green("✓")} ${event.message}\n`);
    }
    if (event.summary) {
      stdout.write(`\n${paint.bold("Summary")}\n`);
      for (const line of event.summary.split(/\r?\n/)) {
        stdout.write(`  ${line}\n`);
      }
    }
  }

  private renderError(event: Extract<AgentEvent, { type: "error" }>): void {
    stdout.write(`${paint.red("✗")} ${paint.bold(event.code)}: ${event.message}\n`);
    if (this.opts.verbose && event.details) {
      stderr.write(`  ${paint.dim(JSON.stringify(event.details))}\n`);
    }
  }
}
