import { stdout } from "node:process";

import { paint } from "../render.js";
import { ansi, isAnimationEnabled, onCleanup } from "../tty.js";
import { jitter, sleep } from "./delay.js";

const SPIN_FRAMES = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];

export interface ChecklistItem {
  label: string;
  /** Optional dim hint that follows the label. */
  hint?: string;
  /** Override per-item working duration. Default ~250-550ms jitter. */
  workMs?: number;
}

export interface ChecklistOptions {
  items: ReadonlyArray<ChecklistItem>;
  /** Per-step spinner frame interval. Default 80ms. */
  intervalMs?: number;
}

/**
 * Render a list of steps that each spin in turn and resolve to a green
 * checkmark when done. Useful for "mapping ... → mapped" style flows.
 *
 * When animations are off, prints each item on its own line so the
 * sequence is still readable in CI / logs.
 */
export async function runChecklist(opts: ChecklistOptions): Promise<void> {
  if (!isAnimationEnabled()) {
    for (const item of opts.items) {
      const hint = item.hint ? paint.dim(`  ${item.hint}`) : "";
      stdout.write(`  ${paint.green("\u2713")} ${item.label}${hint}\n`);
    }
    return;
  }

  const intervalMs = opts.intervalMs ?? 80;

  stdout.write(ansi.hideCursor);
  const dispose = onCleanup(() => {
    stdout.write(ansi.showCursor);
  });

  try {
    for (const item of opts.items) {
      await spinOneItem(item, intervalMs);
    }
  } finally {
    stdout.write(ansi.showCursor);
    dispose();
  }
}

async function spinOneItem(item: ChecklistItem, intervalMs: number): Promise<void> {
  const hint = item.hint ? paint.dim(`  ${item.hint}`) : "";
  let frame = 0;
  let stopped = false;

  const render = (): void => {
    const glyph = paint.cyan(SPIN_FRAMES[frame] ?? "·");
    stdout.write(`${ansi.clearLine}  ${glyph} ${item.label}${hint}`);
    frame = (frame + 1) % SPIN_FRAMES.length;
  };

  render();
  const timer = setInterval(() => {
    if (!stopped) render();
  }, intervalMs);

  if (item.workMs !== undefined) {
    await sleep(item.workMs);
  } else {
    await jitter(220, 540);
  }

  stopped = true;
  clearInterval(timer);
  stdout.write(`${ansi.clearLine}  ${paint.green("\u2713")} ${item.label}${hint}\n`);
}
