import { stdout } from "node:process";

import { paint } from "../render.js";
import { ansi, isAnimationEnabled, onCleanup } from "../tty.js";
import { sleep } from "./delay.js";

const LOGO = [
  "  _   _  __   __  _        ___    _   _ ",
  " | \\ | | \\ \\ / / | |     / _ \\  | \\ | |",
  " |  \\| |  \\ V /  | |    | | | | |  \\| |",
  " | |\\  |   | |   | |___ | |_| | | |\\  |",
  " |_| \\_|   |_|   |_____| \\___/  |_| \\_|",
];

const MAX_COL = LOGO.reduce((m, r) => Math.max(m, r.length), 0);

const BASE = (s: string): string => paint.dim(paint.cyan(s));
const MID = (s: string): string => paint.cyan(s);
const PEAK = (s: string): string => paint.bold(paint.cyan(s));
const FINAL = (s: string): string => paint.bold(paint.cyan(s));

/**
 * Animated NYLON banner. The reveal is:
 *   1. Lay the logo down in dim cyan as a base canvas.
 *   2. Sweep a shimmer highlight left → right across all rows.
 *   3. Settle on a clean bold-cyan palette and print the subtitle.
 *
 * Every step is gated by isAnimationEnabled(); when animations are
 * off (CI, NO_COLOR, non-TTY, NYLON_NO_ANIMATION) we just print
 * the final coloured banner once.
 */
export async function renderBanner(subtitle?: string): Promise<void> {
  if (!isAnimationEnabled()) {
    for (const row of LOGO) stdout.write(FINAL(row) + "\n");
    if (subtitle) stdout.write(paint.dim(subtitle) + "\n\n");
    return;
  }

  stdout.write(ansi.hideCursor);
  const dispose = onCleanup(() => stdout.write(ansi.showCursor));

  try {
    for (const row of LOGO) stdout.write(BASE(row) + "\n");
    await sleep(140);

    await shimmerSweep();

    stdout.write(ansi.moveUp(LOGO.length));
    for (const row of LOGO) stdout.write(`${ansi.clearLine}${FINAL(row)}\n`);
    await sleep(60);
  } finally {
    stdout.write(ansi.showCursor);
    dispose();
  }

  if (subtitle) {
    stdout.write(`\n${paint.dim(subtitle)}\n\n`);
  } else {
    stdout.write("\n");
  }
}

async function shimmerSweep(): Promise<void> {
  const padding = 6;
  const startCol = -padding;
  const endCol = MAX_COL + padding;
  const frames = 32;
  const frameMs = 26;

  stdout.write(ansi.moveUp(LOGO.length));

  for (let f = 0; f <= frames; f++) {
    const t = f / frames;
    const col = Math.round(startCol + t * (endCol - startCol));
    for (const row of LOGO) {
      stdout.write(`${ansi.clearLine}${renderShimmerLine(row, col)}\n`);
    }
    if (f < frames) stdout.write(ansi.moveUp(LOGO.length));
    await sleep(frameMs);
  }
}

/**
 * Group consecutive characters that share the same shimmer intensity
 * into a single ANSI span. Keeps the byte count low so each frame
 * paints in one terminal vsync without flicker.
 */
function renderShimmerLine(line: string, shimmerCol: number): string {
  if (line.length === 0) return "";
  let out = "";
  let buf = "";
  let bufKind: Kind | null = null;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i] ?? " ";
    const kind = ch === " " ? "space" : intensityAt(i, shimmerCol);
    if (kind !== bufKind && buf.length > 0) {
      out += paintSpan(buf, bufKind ?? "base");
      buf = "";
    }
    buf += ch;
    bufKind = kind;
  }
  if (buf.length > 0) out += paintSpan(buf, bufKind ?? "base");
  return out;
}

type Kind = "peak" | "mid" | "base" | "space";

function intensityAt(col: number, shimmerCol: number): Kind {
  const d = Math.abs(col - shimmerCol);
  if (d <= 1) return "peak";
  if (d <= 4) return "mid";
  return "base";
}

function paintSpan(s: string, kind: Kind): string {
  switch (kind) {
    case "peak":
      return PEAK(s);
    case "mid":
      return MID(s);
    case "base":
      return BASE(s);
    case "space":
      return s;
  }
}

/**
 * One-line glowing banner for sub-sections, e.g. "Task exporter".
 * Cycles through a few colours over ~250ms so it pops on entry.
 */
export async function pulseTitle(text: string): Promise<void> {
  const line = `\u25C6 ${text}`;
  if (!isAnimationEnabled()) {
    stdout.write(`${paint.bold(line)}\n`);
    return;
  }

  const frames = [paint.dim(line), paint.cyan(line), paint.blue(line), paint.bold(line)];
  for (const frame of frames) {
    stdout.write(`${ansi.clearLine}${frame}`);
    await sleep(65);
  }
  stdout.write("\n");
}
