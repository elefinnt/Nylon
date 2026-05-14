import { stdout } from "node:process";
import { basename } from "node:path";

import { sleep } from "../../cli/anim/index.js";
import type { Prompter } from "../../cli/prompts.js";
import { paint } from "../../cli/render.js";
import type { ClickUpConfig } from "../../config.js";
import type { Ticket, TicketTree } from "../../pipeline/sow-project/types.js";
import { createClickUpClient, type ClickUpClient } from "./client.js";
import { pickClickUpList } from "./picker.js";
import { buildSubtaskDescription, buildTaskDescription } from "./markdown.js";

export interface ClickUpExportOptions {
  config: ClickUpConfig;
  tree: TicketTree;
  sourcePath: string;
  prompter: Prompter;
}

export interface ClickUpExportResult {
  pushedParents: number;
  pushedSubtasks: number;
  failed: number;
  listUrl: string;
}

/**
 * Full ClickUp export flow: render hierarchy → confirm → pick list →
 * push parents → push subtasks under each parent.
 */
export async function runClickUpExport(opts: ClickUpExportOptions): Promise<ClickUpExportResult> {
  const { config, tree, sourcePath, prompter } = opts;

  const confirmed = await confirmTree(tree, prompter);
  if (!confirmed) {
    stdout.write(`  ${paint.dim("·")} Export cancelled.\n\n`);
    return empty();
  }

  const client = createClickUpClient({ token: config.token });

  let listId = config.default_list_id ?? "";
  let listLabel = listId ? `list ${listId}` : "";
  if (!listId) {
    stdout.write(`\n${paint.bold("◆ Choose destination")}\n\n`);
    const picked = await pickClickUpList(client, prompter);
    if (!picked) {
      stdout.write(`  ${paint.dim("·")} Export cancelled.\n\n`);
      return empty();
    }
    listId = picked.listId;
    listLabel = picked.listName;
  }

  stdout.write(`\n  ${paint.dim("→")} Pushing to ${paint.bold(listLabel)} …\n\n`);

  const result = await pushTree({ client, listId, tree, sourcePath });

  const listUrl = `https://app.clickup.com/t/${listId}`;
  summary(sourcePath, listLabel, result, listUrl);
  return { ...result, listUrl };
}

// ── Confirmation screen ──────────────────────────────────────────────

async function confirmTree(tree: TicketTree, prompter: Prompter): Promise<boolean> {
  stdout.write("\n");
  stdout.write(`${paint.bold("◆ Project plan")}\n\n`);
  stdout.write(`  ${paint.bold(tree.projectName)}\n`);
  if (tree.summary) {
    stdout.write(`  ${paint.dim(tree.summary)}\n`);
  }
  stdout.write("\n");

  let totalParents = 0;
  let totalSubtasks = 0;

  for (const phase of tree.phases) {
    stdout.write(`  ${paint.bold(`◆ ${phase.name}`)}`);
    if (phase.goal) stdout.write(`  ${paint.dim(phase.goal)}`);
    stdout.write("\n");

    for (const epic of phase.epics) {
      stdout.write(`    ${paint.bold(epic.name)}\n`);
      for (const task of epic.tasks) {
        totalParents++;
        totalSubtasks += task.subtasks.length;
        const prio = task.priority !== "normal" ? paint.dim(` [${task.priority}]`) : "";
        const est = paint.dim(` ${formatEstimate(task.estimateDays)}`);
        const subs = task.subtasks.length > 0
          ? paint.dim(` (+${task.subtasks.length} subtask${task.subtasks.length === 1 ? "" : "s"})`)
          : "";
        stdout.write(`      · ${task.title}${prio}${est}${subs}\n`);
      }
    }
    stdout.write("\n");
  }

  if (tree.qualityNotes) {
    stdout.write(`  ${paint.dim("notes: " + tree.qualityNotes)}\n\n`);
  }

  stdout.write(
    `  ${paint.dim("Total:")} ${paint.bold(String(totalParents))} parent task` +
      `${totalParents === 1 ? "" : "s"}, ${paint.bold(String(totalSubtasks))} subtask` +
      `${totalSubtasks === 1 ? "" : "s"}\n\n`,
  );

  if (totalParents === 0) {
    stdout.write(`  ${paint.yellow("!")} No tasks were extracted. Nothing to push.\n\n`);
    return false;
  }

  const choice = await prompter.choice<"push" | "cancel">(
    `Push ${totalParents} parent task${totalParents === 1 ? "" : "s"} + ` +
      `${totalSubtasks} subtask${totalSubtasks === 1 ? "" : "s"} to ClickUp?`,
    [
      { id: "push", label: `Push ${totalParents + totalSubtasks} task${totalParents + totalSubtasks === 1 ? "" : "s"}` },
      { id: "cancel", label: "Cancel" },
    ],
    {},
  );
  return choice === "push";
}

// ── Push tree ────────────────────────────────────────────────────────

interface PushArgs {
  client: ClickUpClient;
  listId: string;
  tree: TicketTree;
  sourcePath: string;
}

async function pushTree(args: PushArgs): Promise<{
  pushedParents: number;
  pushedSubtasks: number;
  failed: number;
}> {
  const { client, listId, tree, sourcePath } = args;
  let pushedParents = 0;
  let pushedSubtasks = 0;
  let failed = 0;

  for (const phase of tree.phases) {
    if (phase.epics.length === 0) continue;
    stdout.write(`  ${paint.bold(`◆ ${phase.name}`)}\n`);

    for (const epic of phase.epics) {
      if (epic.tasks.length === 0) continue;
      stdout.write(`    ${paint.dim(epic.name)}\n`);

      for (const task of epic.tasks) {
        const created = await pushParent({
          client,
          listId,
          task,
          phaseName: phase.name,
          epicName: epic.name,
          sourcePath,
        });
        if (!created) {
          failed++;
          continue;
        }
        pushedParents++;

        for (const subtask of task.subtasks) {
          const ok = await pushSubtask({
            client,
            listId,
            parentId: created.id,
            parentTitle: task.title,
            subtask,
            inheritLabels: task.labels,
            inheritPriority: task.priority,
          });
          if (ok) pushedSubtasks++;
          else failed++;
        }
      }
    }
    stdout.write("\n");
  }

  return { pushedParents, pushedSubtasks, failed };
}

interface PushParentArgs {
  client: ClickUpClient;
  listId: string;
  task: Ticket;
  phaseName: string;
  epicName: string;
  sourcePath: string;
}

async function pushParent(args: PushParentArgs): Promise<{ id: string; url: string } | null> {
  const { client, listId, task, phaseName, epicName, sourcePath } = args;
  const labels = uniqueLabels([...task.labels, slug(phaseName), slug(epicName)]);
  try {
    const created = await client.createTask(listId, {
      name: task.title,
      description: buildTaskDescription(task, { phaseName, epicName, sourcePath }),
      priority: task.priority,
      tags: labels,
    });
    stdout.write(
      `      ${paint.green("✓")} ${paint.dim(created.id.padEnd(14))} ${task.title}\n`,
    );
    await sleep(120);
    return { id: created.id, url: created.url };
  } catch (err: unknown) {
    stdout.write(
      `      ${paint.red("✗")} ${task.title} — ${paint.dim((err as Error).message)}\n`,
    );
    await sleep(120);
    return null;
  }
}

interface PushSubtaskArgs {
  client: ClickUpClient;
  listId: string;
  parentId: string;
  parentTitle: string;
  subtask: { title: string; description?: string };
  inheritLabels: string[];
  inheritPriority: string;
}

async function pushSubtask(args: PushSubtaskArgs): Promise<boolean> {
  const { client, listId, parentId, parentTitle, subtask, inheritLabels, inheritPriority } = args;
  try {
    await client.createTask(listId, {
      name: subtask.title,
      description: buildSubtaskDescription(subtask, parentTitle),
      priority: inheritPriority,
      tags: inheritLabels,
      parent: parentId,
    });
    stdout.write(`        ${paint.green("↳")} ${subtask.title}\n`);
    await sleep(80);
    return true;
  } catch (err: unknown) {
    stdout.write(
      `        ${paint.red("✗")} ${subtask.title} — ${paint.dim((err as Error).message)}\n`,
    );
    await sleep(80);
    return false;
  }
}

// ── Summary ──────────────────────────────────────────────────────────

function summary(
  sourcePath: string,
  listName: string,
  result: { pushedParents: number; pushedSubtasks: number; failed: number },
  listUrl: string,
): void {
  const total = result.pushedParents + result.pushedSubtasks;
  const lines: string[] = [];
  lines.push(paint.dim("  ┌─ summary ───────────────────────────────────"));
  lines.push(`  │ ${paint.bold("source")}      ${basename(sourcePath)}`);
  lines.push(`  │ ${paint.bold("destination")} ${listName}`);
  lines.push(`  │ ${paint.bold("parents")}     ${result.pushedParents}`);
  lines.push(`  │ ${paint.bold("subtasks")}    ${result.pushedSubtasks}`);
  lines.push(`  │ ${paint.bold("total")}       ${total}`);
  if (result.failed > 0) {
    lines.push(`  │ ${paint.bold("failed")}      ${paint.red(String(result.failed))}`);
  }
  lines.push(
    `  │ ${paint.bold("status")}      ${result.failed === 0 ? paint.green("ok") : paint.yellow("partial")}`,
  );
  lines.push(`  │ ${paint.bold("open")}        ${paint.cyan(listUrl)}`);
  lines.push(paint.dim("  └─────────────────────────────────────────────"));
  stdout.write(lines.join("\n") + "\n");
}

// ── Helpers ──────────────────────────────────────────────────────────

function empty(): ClickUpExportResult {
  return { pushedParents: 0, pushedSubtasks: 0, failed: 0, listUrl: "" };
}

function uniqueLabels(labels: ReadonlyArray<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of labels) {
    const trimmed = raw?.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(trimmed);
  }
  return out;
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function formatEstimate(days: number): string {
  if (days >= 1) {
    const rounded = Math.round(days * 10) / 10;
    return `${rounded}d`;
  }
  return `${Math.round(days * 8)}h`;
}
