import { stdin, stdout, stderr } from "node:process";

import { paint } from "../render.js";

/** Printable columns for cat rows + rainbow row (single monospace strip). */
const VIEW_W = 28;

/** Header row + blank row before the cat block (matches `\n\n` after title). */
const HEADER_ROW_COUNT = 2;
/** First terminal row (1-based) where cat ears are drawn. */
const CAT_FIRST_ROW = HEADER_ROW_COUNT + 1;

/** ANSI rainbow segments (VT-enabled terminals). */
const RAINBOW_FG = [
  "\x1b[91m",
  "\x1b[93m",
  "\x1b[92m",
  "\x1b[96m",
  "\x1b[94m",
  "\x1b[95m",
] as const;
const RESET = "\x1b[0m";

const SCENE_MARGIN = "    ";

/** Frame cadence (must match `delay()` in the render loop). */
const FRAME_MS = 260;

/** Whispers disappear after this wall-clock duration. */
const WHISPER_TTL_MS = 1500;

function rowInView(text: string): string {
  const pad = Math.max(0, Math.floor((VIEW_W - text.length) / 2));
  return `${" ".repeat(pad)}${text}`;
}

function catBlock(eyes: string, mouthRow?: string): string {
  const row3 = mouthRow ?? " > ^ <";
  return [`${rowInView("|\\__/|")}`, `${rowInView(`( ${eyes} )`)}`, `${rowInView(row3)}`].join("\n");
}

/** One-row rainbow exactly VIEW_W graphic cells wide (ANSI excluded from width math). */
function rainbowTrail(phase: number): string {
  let line = "";
  for (let i = 0; i < VIEW_W; i++) {
    const colour = RAINBOW_FG[(phase + i) % RAINBOW_FG.length] ?? RAINBOW_FG[0]!;
    line += `${colour}=${RESET}`;
  }
  return line;
}

function scene(facePhase: number, rainbowPhase: number): string {
  const faces: readonly string[] = [
    catBlock("o.o"),
    catBlock("-.-"),
    catBlock("o.o"),
    catBlock("o.o", "> ^ /"),
    catBlock("o.o", "> ^ \\"),
    catBlock("o.o"),
    catBlock("^.^"),
    catBlock("o.o", " > ~ <"),
  ];
  const cat = faces[facePhase % faces.length] ?? faces[0]!;
  const catIndented = cat.split("\n").map((line) => `${SCENE_MARGIN}${line}`).join("\n");
  return `${catIndented}\n${SCENE_MARGIN}${rainbowTrail(rainbowPhase)}`;
}

// ── Floating “ps…” whispers ─────────────────────────────────────────────────

interface Whisper {
  r: number;
  c: number;
  vr: number;
  vc: number;
  bornAt: number;
  label: string;
}

const WHISPER_CAP = 14;
const SPAWN_CHANCE = 0.44;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function ansiColoursOk(): boolean {
  return !process.env.NO_COLOR && process.env.TERM !== "dumb";
}

/**
 * Horizontal centre of the cat canvas (1-based column).
 * First content column is `1 + SCENE_MARGIN.length`; centre sits midway across `VIEW_W`.
 */
function anchorCol(): number {
  const contentLeft = 1 + SCENE_MARGIN.length;
  return contentLeft + Math.floor(VIEW_W / 2) - 1;
}

/** Rough vertical centre of the face (eyes row), 1-based. */
function anchorRow(): number {
  return CAT_FIRST_ROW + 1;
}

/** One to three repetitions of `ps` → `ps`, `psps`, or `pspsps`. */
function pickLabel(): string {
  const reps = 1 + Math.floor(Math.random() * 3);
  return "ps".repeat(reps);
}

function spawnWhisper(cols: number, rows: number, ay: number, ax: number): Whisper {
  const label = pickLabel();
  const theta = Math.random() * Math.PI * 2;
  const jitterR = (Math.random() - 0.5) * 4;
  const jitterC = (Math.random() - 0.5) * 8;
  let r = ay + Math.sin(theta) * 2.5 + jitterR;
  let c = ax + Math.cos(theta) * 5.5 + jitterC;
  r = clamp(r, CAT_FIRST_ROW - 1, rows - 1);
  c = clamp(c, 1, Math.max(1, cols - label.length));
  return {
    r,
    c,
    vr: -0.12 - Math.random() * 0.22,
    vc: (Math.random() - 0.5) * 0.38,
    bornAt: performance.now(),
    label,
  };
}

function whisperStyle(progress: number, coloursOk: boolean): string {
  if (!coloursOk) return "";
  if (progress < 0.22) return "\x1b[97m";
  if (progress < 0.42) return "\x1b[37m";
  if (progress < 0.6) return "\x1b[90m";
  if (progress < 0.78) return "\x1b[2m\x1b[37m";
  return "\x1b[2m\x1b[90m";
}

/** Plain-text fade when colour styling is disabled (`NO_COLOR`). */
function whisperGlyph(progress: number, label: string): string {
  if (progress > 0.92) return "";
  const vis = Math.max(1, Math.ceil(label.length * (1 - progress * 0.88)));
  return label.slice(0, vis);
}

function tickWhispers(
  list: Whisper[],
  cols: number,
  rows: number,
  ay: number,
  ax: number,
  now: number,
): Whisper[] {
  const next: Whisper[] = [];
  for (const w of list) {
    if (now - w.bornAt >= WHISPER_TTL_MS) continue;
    const ageMs = now - w.bornAt;
    let r = w.r + w.vr;
    let c =
      w.c +
      w.vc +
      Math.sin(ageMs * 0.004 + w.bornAt * 0.002) * 0.12;
    r = clamp(r, 2, rows - 1);
    c = clamp(c, 1, Math.max(1, cols - w.label.length));
    next.push({ ...w, r, c });
  }
  if (next.length < WHISPER_CAP && Math.random() < SPAWN_CHANCE) {
    next.push(spawnWhisper(cols, rows, ay, ax));
  }
  return next;
}

function cursorTo(row: number, col: number): string {
  return `\x1b[${row};${col}H`;
}

function renderWhispers(
  list: Whisper[],
  cols: number,
  rows: number,
  coloursOk: boolean,
  now: number,
): string {
  let buf = "";
  for (const w of list) {
    const progress = clamp((now - w.bornAt) / WHISPER_TTL_MS, 0, 1);
    const rr = Math.round(w.r);
    const cc = Math.round(w.c);
    if (rr < 1 || rr > rows || cc < 1 || cc > cols) continue;

    const styled = coloursOk ? w.label : whisperGlyph(progress, w.label);
    if (styled.length === 0) continue;

    buf += cursorTo(rr, cc);
    buf += whisperStyle(progress, coloursOk);
    buf += styled;
    buf += RESET;
  }
  return buf;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * `nylon cat` — lightweight ASCII animation until q or Ctrl+C.
 */
export async function runCatCommand(): Promise<number> {
  if (!stdout.isTTY || !stdin.isTTY) {
    stderr.write(
      `${paint.red("✗")} ${paint.bold("nylon cat")} needs an interactive terminal.\n`,
    );
    return 1;
  }

  let running = true;
  const stop = (): void => {
    running = false;
  };

  stdin.setRawMode(true);
  stdin.resume();
  stdout.write("\x1b[?25l");

  const onData = (data: Buffer): void => {
    const key = data.toString("utf8");
    if (key === "\u0003" || key.toLowerCase() === "q") stop();
  };

  stdin.on("data", onData);
  process.once("SIGINT", stop);

  const coloursOk = ansiColoursOk();
  let whispers: Whisper[] = [];

  try {
    let frame = 0;
    while (running) {
      const cols = stdout.columns ?? 80;
      const rows = stdout.rows ?? 24;
      const ay = anchorRow();
      const ax = anchorCol();
      const now = performance.now();

      whispers = tickWhispers(whispers, cols, rows, ay, ax, now);

      stdout.write("\x1b[2J\x1b[H");
      stdout.write(`${paint.dim("nylon cat · press q or Ctrl+C to quit")}\n\n`);
      stdout.write(scene(frame, frame));
      stdout.write("\n");
      stdout.write(renderWhispers(whispers, cols, rows, coloursOk, now));

      frame += 1;
      await delay(FRAME_MS);
    }
  } finally {
    stdin.off("data", onData);
    if (stdin.isTTY) stdin.setRawMode(false);
    stdout.write("\x1b[?25h\x1b[2J\x1b[H");
  }

  return 0;
}
