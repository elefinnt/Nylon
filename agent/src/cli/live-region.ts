import { stdout } from "node:process";

import { ansi, isAnimationEnabled, onCleanup } from "./tty.js";

/**
 * A vertical "window" anchored to the cursor position when it's first
 * rendered. Calling `render(text)` clears whatever the region drew
 * previously and writes the new content in its place; everything above
 * the region (e.g. the NYLON banner) is left untouched.
 *
 * Only one LiveRegion should be active at a time, and nothing else
 * should write to stdout while it's active - otherwise the bookkeeping
 * for line counts goes out of sync and you'll see corruption.
 *
 * When ANSI redraws aren't available (CI, NO_COLOR, non-TTY) the region
 * degrades gracefully: each render is appended to scrollback so menu
 * output stays readable in logs even though it loses the in-place feel.
 */
export class LiveRegion {
  private linesDrawn = 0;
  private active = true;
  private readonly canRedraw: boolean;
  private readonly disposeCleanup: () => void;

  constructor() {
    this.canRedraw = isAnimationEnabled() && stdout.isTTY === true;
    // If the process dies mid-render, do our best to leave a tidy
    // terminal behind: erase whatever we last drew and show the cursor.
    this.disposeCleanup = onCleanup(() => {
      if (!this.active) return;
      if (this.canRedraw) this.eraseDrawn();
      stdout.write(ansi.showCursor);
    });
  }

  /** Replace the region's contents with the supplied text. */
  render(text: string): void {
    if (!this.active) return;
    const body = text.endsWith("\n") ? text : text + "\n";
    if (!this.canRedraw) {
      stdout.write(body);
      return;
    }
    this.eraseDrawn();
    stdout.write(body);
    this.linesDrawn = countNewlines(body);
  }

  /**
   * Wipe the region but keep it active, leaving the cursor where the
   * region originally started. Use this when handing off to a long-
   * running flow that wants to write into scrollback; the next call to
   * `render` starts a fresh region anchored at the cursor's new spot.
   */
  pause(): void {
    if (!this.active) return;
    if (this.canRedraw) this.eraseDrawn();
    this.linesDrawn = 0;
  }

  /** Wipe the region's contents and stop tracking it. */
  close(): void {
    if (!this.active) return;
    if (this.canRedraw) this.eraseDrawn();
    this.linesDrawn = 0;
    this.active = false;
    this.disposeCleanup();
  }

  /** True when this region is performing real in-place redraws. */
  get redrawSupported(): boolean {
    return this.canRedraw;
  }

  private eraseDrawn(): void {
    for (let i = 0; i < this.linesDrawn; i++) {
      stdout.write(ansi.moveUp(1));
      stdout.write(ansi.clearLine);
    }
    this.linesDrawn = 0;
  }
}

function countNewlines(text: string): number {
  let n = 0;
  for (const ch of text) if (ch === "\n") n++;
  return n;
}
