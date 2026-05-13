import { stdout } from "node:process";

import { paint } from "./render.js";
import { ansi, isAnimationEnabled, onCleanup } from "./tty.js";

const FRAMES = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];
const INTERVAL_MS = 80;

export interface SpinnerOptions {
  intervalMs?: number;
  stream?: NodeJS.WriteStream;
}

/**
 * A minimal animated spinner. Falls back to plain printing on non-TTY
 * streams or when NO_COLOR / CI / PR_AGENT_NO_ANIMATION is set, so the
 * NDJSON IPC mode and CI output stay clean.
 *
 * Lifecycle: `start(text)` -> optional `update(text)` (and `pause/resume`
 * when something else needs to write to the same stream) -> exactly one of
 * `succeed`, `fail`, `info`, or `stop` to release the line.
 */
export class Spinner {
  private readonly stream: NodeJS.WriteStream;
  private readonly intervalMs: number;
  private readonly animated: boolean;

  private frameIdx = 0;
  private timer: NodeJS.Timeout | undefined;
  private text = "";
  private active = false;
  private paused = false;
  private disposeCleanup: (() => void) | undefined;

  constructor(opts: SpinnerOptions = {}) {
    this.stream = opts.stream ?? stdout;
    this.intervalMs = opts.intervalMs ?? INTERVAL_MS;
    this.animated = isAnimationEnabled() && this.stream.isTTY === true;
  }

  start(text: string): void {
    if (this.active) {
      this.update(text);
      return;
    }
    this.text = text;
    if (!this.animated) {
      this.stream.write(`  ${paint.dim("·")} ${text}\n`);
      return;
    }
    this.active = true;
    this.paused = false;
    this.stream.write(ansi.hideCursor);
    this.disposeCleanup = onCleanup(() => this.forceCleanup());
    this.render();
    this.timer = setInterval(() => this.render(), this.intervalMs);
  }

  update(text: string): void {
    this.text = text;
    if (this.active && !this.paused) this.render();
  }

  /** Temporarily clear the spinner line so something else can write. */
  pause(): void {
    if (!this.active || this.paused) return;
    this.paused = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.stream.write(ansi.clearLine);
  }

  resume(): void {
    if (!this.active || !this.paused) return;
    this.paused = false;
    this.render();
    this.timer = setInterval(() => this.render(), this.intervalMs);
  }

  succeed(text?: string): void {
    this.stop({ symbol: paint.green("\u2713"), text });
  }

  fail(text?: string): void {
    this.stop({ symbol: paint.red("\u2717"), text });
  }

  info(text?: string): void {
    this.stop({ symbol: paint.cyan("\u2022"), text });
  }

  stop(opts: { symbol?: string; text?: string } = {}): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    if (this.active) {
      this.stream.write(ansi.clearLine);
      this.stream.write(ansi.showCursor);
    }
    this.active = false;
    this.paused = false;
    if (this.disposeCleanup) {
      this.disposeCleanup();
      this.disposeCleanup = undefined;
    }
    const text = opts.text ?? this.text;
    if (opts.symbol || text) {
      const symbol = opts.symbol ?? "";
      this.stream.write(`${symbol ? `${symbol} ` : ""}${text}\n`);
    }
  }

  private render(): void {
    const frame = FRAMES[this.frameIdx];
    this.frameIdx = (this.frameIdx + 1) % FRAMES.length;
    this.stream.write(`${ansi.clearLine}${paint.cyan(frame ?? "")} ${this.text}`);
  }

  private forceCleanup(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.active) {
      this.stream.write(ansi.clearLine);
      this.stream.write(ansi.showCursor);
    }
  }
}
