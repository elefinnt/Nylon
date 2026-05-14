import { stdout } from "node:process";

import { paint } from "../render.js";
import { ansi, isAnimationEnabled, onCleanup } from "../tty.js";
import { sleep } from "./delay.js";

export interface ProgressBarOptions {
  label: string;
  /** Total steps the bar will cover. Default 40. */
  width?: number;
  /** Total wall-clock duration for `run()`. Default 1600ms. */
  durationMs?: number;
  /** Optional suffix renderer (e.g. counts) called per tick. */
  suffix?: (percent: number) => string;
  /** Symbol used for the filled portion. Default block. */
  fillChar?: string;
  /** Symbol used for the empty portion. Default `·`. */
  emptyChar?: string;
}

/**
 * Animated horizontal progress bar that fills from 0 → 100% over the
 * given duration. Synchronously prints a one-line summary when
 * animations are disabled so the flow is still readable in logs.
 */
export async function runProgressBar(opts: ProgressBarOptions): Promise<void> {
  const width = opts.width ?? 32;
  const duration = opts.durationMs ?? 1600;
  const fill = opts.fillChar ?? "\u2588";
  const empty = opts.emptyChar ?? "\u00B7";

  if (!isAnimationEnabled()) {
    stdout.write(`  ${paint.dim("·")} ${opts.label} ${paint.dim("(done)")}\n`);
    return;
  }

  stdout.write(ansi.hideCursor);
  const dispose = onCleanup(() => {
    stdout.write(ansi.clearLine);
    stdout.write(ansi.showCursor);
  });

  const start = Date.now();
  const tickMs = 32;

  try {
    while (true) {
      const elapsed = Date.now() - start;
      const ratio = Math.min(1, elapsed / duration);
      drawBar(opts.label, ratio, width, fill, empty, opts.suffix);
      if (ratio >= 1) break;
      await sleep(tickMs);
    }
    drawBar(opts.label, 1, width, fill, empty, opts.suffix);
    stdout.write("\n");
  } finally {
    stdout.write(ansi.showCursor);
    dispose();
  }
}

function drawBar(
  label: string,
  ratio: number,
  width: number,
  fill: string,
  empty: string,
  suffix: ((percent: number) => string) | undefined,
): void {
  const filled = Math.round(ratio * width);
  const bar = paint.cyan(fill.repeat(filled)) + paint.dim(empty.repeat(width - filled));
  const pct = `${Math.round(ratio * 100).toString().padStart(3, " ")}%`;
  const tail = suffix ? ` ${paint.dim(suffix(ratio))}` : "";
  stdout.write(`${ansi.clearLine}  ${paint.bold(label)} ${bar} ${pct}${tail}`);
}
