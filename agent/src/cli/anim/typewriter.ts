import { stdout } from "node:process";

import { paint } from "../render.js";
import { isAnimationEnabled } from "../tty.js";
import { sleep } from "./delay.js";

export interface TypewriterOptions {
  /** Milliseconds between characters. Default 18. */
  perCharMs?: number;
  /** Extra pause at the end of the line in ms. Default 80. */
  trailMs?: number;
  /** Append a newline after the line. Default true. */
  newline?: boolean;
  stream?: NodeJS.WriteStream;
}

/**
 * Stream text one character at a time. Falls back to a single write
 * (still followed by newline if requested) when animations are off.
 */
export async function typeLine(text: string, opts: TypewriterOptions = {}): Promise<void> {
  const stream = opts.stream ?? stdout;
  const newline = opts.newline ?? true;

  if (!isAnimationEnabled()) {
    stream.write(text + (newline ? "\n" : ""));
    return;
  }

  const per = opts.perCharMs ?? 18;
  for (const ch of text) {
    stream.write(ch);
    if (per > 0) await sleep(per);
  }
  if (opts.trailMs && opts.trailMs > 0) await sleep(opts.trailMs);
  if (newline) stream.write("\n");
}

/**
 * Fade a heading in by cycling through a short palette of dim → bold.
 * Cheap visual flair to mark a new section. No-op when animations off.
 */
export async function flashHeading(text: string): Promise<void> {
  if (!isAnimationEnabled()) {
    stdout.write(`${paint.bold(text)}\n`);
    return;
  }

  const frames = [paint.dim(text), paint.cyan(text), paint.bold(text)];
  for (let i = 0; i < frames.length; i++) {
    stdout.write(`\r\u001b[2K${frames[i]}`);
    await sleep(70);
  }
  stdout.write("\n");
}
