import { existsSync, statSync } from "node:fs";
import { basename } from "node:path";
import { stdout } from "node:process";

import {
  flashHeading,
  jitter,
  pulseTitle,
  runChecklist,
  runProgressBar,
  sleep,
  typeLine,
} from "../anim/index.js";
import type { Prompter } from "../prompts.js";
import { paint } from "../render.js";
import {
  EXTRACTED_TASK_POOL,
  type IntegrationId,
  type IntegrationMock,
  type MockTaskRow,
} from "./task-exporter-data.js";

interface SourceProbe {
  /** Raw input as typed. May be a path that exists or just a name. */
  raw: string;
  /** Pretty display name (basename or full path). */
  label: string;
  /** "file" / "directory" / "unknown" – drives the scan suffix. */
  kind: "file" | "directory" | "unknown";
  /** Bytes for files, child count for dirs, undefined when unknown. */
  size?: number;
}

interface SourceResult {
  probe: SourceProbe;
  candidates: ReadonlyArray<string>;
}

/**
 * Run a fully scripted demo of a task-exporter integration. The user
 * names a file / folder to "read", we pretend to grep it for tasks,
 * then the rest of the pipeline (connect → map → push → summary)
 * animates the result. No network, no actual file reading - just
 * vibes-driven feedback themed around the path they typed.
 */
export async function runMockExport(
  mock: IntegrationMock,
  prompter: Prompter,
): Promise<void> {
  stdout.write("\n");
  await pulseTitle(`Export to ${mock.displayName}`);
  stdout.write(paint.dim("  ─────────────────────────────────────────────\n"));
  stdout.write(
    `  ${paint.yellow("●")} ${paint.dim("demo mode")}` +
      paint.dim(" — eventually we'll really grep this. for now: theatre.\n\n"),
  );

  const source = await runSourceStage(prompter);
  const tasks =
    source.candidates.length > 0
      ? buildTasksFromInput(mock, source.candidates)
      : [...mock.tasks];

  await connect(mock);
  await map(mock);
  await push(mock, tasks);
  summary(mock, source, tasks);
}

async function runSourceStage(prompter: Prompter): Promise<SourceResult> {
  await flashHeading(`1. Source`);
  stdout.write(
    paint.dim("  Point me at a file or folder and I'll go fishing for tasks.\n") +
      paint.dim("  Enter to skip → I'll fall back to a canned demo set.\n\n"),
  );

  const raw = (
    await prompter.text("  source", { required: false })
  ).trim();

  if (raw === "") {
    stdout.write(`\n  ${paint.dim("·")} no path given — using the canned demo dataset.\n\n`);
    return {
      probe: { raw: "", label: "<canned demo>", kind: "unknown" },
      candidates: [],
    };
  }

  const probe = probePath(raw);
  printProbeReceipt(probe);

  await runProgressBar({
    label: `Reading ${probe.label}`,
    durationMs: 1100,
    suffix: (r) => readingSuffix(probe, r),
  });

  const candidates = sampleCandidates(probe.raw);
  await runProgressBar({
    label: "Grepping for task-shaped lines",
    durationMs: 1200,
    suffix: (r) => `${Math.round(r * 42)} lines / ${Math.round(r * candidates.length)} candidates`,
  });

  stdout.write(
    `  ${paint.green("\u2713")} pulled ${paint.bold(`${candidates.length}`)} task${candidates.length === 1 ? "" : "s"} out of ${paint.bold(probe.label)}\n`,
  );
  await typeLine(
    paint.dim("    here's what caught my eye:"),
    { perCharMs: 8, trailMs: 80 },
  );
  for (const c of candidates) {
    stdout.write(`    ${paint.dim("·")} ${c}\n`);
    await sleep(35);
  }
  stdout.write("\n");

  return { probe, candidates };
}

function probePath(raw: string): SourceProbe {
  const label = basename(raw) || raw;
  if (!existsSync(raw)) {
    return { raw, label, kind: "unknown" };
  }
  try {
    const stat = statSync(raw);
    if (stat.isDirectory()) {
      return { raw, label, kind: "directory", size: undefined };
    }
    return { raw, label, kind: "file", size: stat.size };
  } catch {
    return { raw, label, kind: "unknown" };
  }
}

function printProbeReceipt(probe: SourceProbe): void {
  if (probe.kind === "file") {
    const size = probe.size ?? 0;
    stdout.write(
      `  ${paint.green("\u2713")} resolved ${paint.bold(probe.label)} ` +
        paint.dim(`(file, ${formatBytes(size)})\n`),
    );
  } else if (probe.kind === "directory") {
    stdout.write(
      `  ${paint.green("\u2713")} resolved ${paint.bold(probe.label)} ` +
        paint.dim("(directory — I'll walk the top level)\n"),
    );
  } else {
    stdout.write(
      `  ${paint.yellow("!")} couldn't stat ${paint.bold(probe.label)} — improvising for the demo.\n`,
    );
  }
  stdout.write("\n");
}

function readingSuffix(probe: SourceProbe, r: number): string {
  if (probe.kind === "file" && probe.size !== undefined) {
    return `${formatBytes(Math.round(probe.size * r))} / ${formatBytes(probe.size)}`;
  }
  if (probe.kind === "directory") {
    return `${Math.round(r * 18)} entries scanned`;
  }
  return `${Math.round(r * 1247)} lines parsed`;
}

async function connect(mock: IntegrationMock): Promise<void> {
  await flashHeading(`2. Connect`);
  await typeLine(
    `  ${paint.dim("→")} dialling ${paint.bold(mock.endpoint)} ...`,
    { perCharMs: 10 },
  );
  await jitter(280, 520);
  stdout.write(`  ${paint.green("\u2713")} authenticated as ${paint.bold(mock.account)}\n`);
  stdout.write(`  ${paint.green("\u2713")} workspace ${paint.bold(mock.workspace)}\n\n`);
}

async function map(mock: IntegrationMock): Promise<void> {
  await flashHeading(`3. Route to destinations`);
  await runChecklist({
    items: mock.boards.map((b) => ({
      label: `send to ${paint.bold(b.name)}`,
      hint: b.hint,
    })),
  });
  stdout.write("\n");
}

async function push(
  mock: IntegrationMock,
  tasks: ReadonlyArray<MockTaskRow>,
): Promise<void> {
  await flashHeading(`4. Push to ${mock.displayName}`);
  const items = tasks.map((t) => ({
    label: `${paint.dim(t.id.padEnd(12, " "))} ${t.title}`,
    hint: `→ ${t.destination}`,
    workMs: 240 + Math.floor(Math.random() * 220),
  }));
  await runChecklist({ items });
  stdout.write("\n");

  await runProgressBar({
    label: "Finalising sync",
    durationMs: 900,
    suffix: (r) => `${Math.round(r * tasks.length)} / ${tasks.length} synced`,
  });
  stdout.write("\n");
  await sleep(120);
}

function summary(
  mock: IntegrationMock,
  source: SourceResult,
  tasks: ReadonlyArray<MockTaskRow>,
): void {
  const lines: string[] = [];
  lines.push(paint.dim("  ┌─ summary ───────────────────────────────────"));
  lines.push(`  │ ${paint.bold("provider")}    ${mock.displayName}`);
  lines.push(`  │ ${paint.bold("workspace")}   ${mock.workspace}`);
  lines.push(`  │ ${paint.bold("source")}      ${source.probe.label}`);
  lines.push(
    `  │ ${paint.bold("synced")}      ${tasks.length} tasks across ${mock.boards.length} destinations`,
  );
  lines.push(`  │ ${paint.bold("status")}      ${paint.green("ok")} ${paint.dim("(simulated)")}`);
  lines.push(`  │ ${paint.bold("open")}        ${paint.cyan(mock.summaryUrl)}`);
  lines.push(paint.dim("  └─────────────────────────────────────────────"));
  stdout.write(lines.join("\n") + "\n");
}

function buildTasksFromInput(
  mock: IntegrationMock,
  candidates: ReadonlyArray<string>,
): MockTaskRow[] {
  return candidates.map((title, i) => {
    const board = mock.boards[i % mock.boards.length] ?? mock.boards[0];
    const dest = board ? `${board.name} / In progress` : "Inbox / Triage";
    return {
      id: synthId(mock.id, i),
      title: truncate(title, 60),
      destination: dest,
    };
  });
}

function synthId(integration: IntegrationId, i: number): string {
  switch (integration) {
    case "monday":
      return `M-${4900 + i}`;
    case "jira":
      return `PRAG-${330 + i}`;
    case "clickup":
      return `CU-${(0x8a2000 + i).toString(16)}`;
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}\u2026`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Pick 4-7 entries from the pool, seeded by the input path so the
 * same path produces the same set within a session (nicer for retakes
 * during a recording).
 */
function sampleCandidates(seed: string): string[] {
  const count = 4 + Math.floor(seededRandom(seed, 0) * 4);
  const picks = new Set<number>();
  let salt = 1;
  while (picks.size < count && picks.size < EXTRACTED_TASK_POOL.length) {
    const idx = Math.floor(seededRandom(seed, salt) * EXTRACTED_TASK_POOL.length);
    picks.add(idx);
    salt++;
  }
  return [...picks].map((i) => EXTRACTED_TASK_POOL[i] as string);
}

function seededRandom(seed: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Map to [0, 1)
  return ((h >>> 0) % 100000) / 100000;
}
