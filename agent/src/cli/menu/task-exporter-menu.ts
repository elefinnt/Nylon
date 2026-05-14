import { stdout } from "node:process";

import type { LiveRegion } from "../live-region.js";
import type { Prompter } from "../prompts.js";
import { paint } from "../render.js";
import { loadConfig } from "../../config.js";
import { runExtract } from "../../pipeline/extract-orchestrator.js";
import { runClickUpExport } from "../../integrations/clickup/export.js";
import { cleanPathString } from "../../util/paths.js";
import { getIntegrationMock, type IntegrationId } from "./task-exporter-data.js";
import { runMockExport } from "./task-exporter-mock.js";
import { promptPostRun, type SubMenuOutcome } from "./post-run.js";

/**
 * Sub-menu for the task exporter section.
 *
 * When a real integration token is present in config, the live pipeline
 * runs (read → extract → confirm → push). When no token is configured,
 * the integration falls back to the scripted demo flow so the UX is
 * still demonstrable without credentials.
 */
const INTEGRATIONS = [
  { id: "clickup", label: "ClickUp", hint: "Export to ClickUp tasks" },
  // Monday.com and Jira are temporarily hidden until their live integrations
  // are implemented. Re-add them here when the real exporters ship.
  // { id: "monday", label: "Monday.com", hint: "Export to Monday boards" },
  // { id: "jira", label: "Jira", hint: "Export to Jira issues" },
] as const;

type MenuChoice = IntegrationId | "back";

export async function runTaskExporterMenu(
  prompter: Prompter,
  region: LiveRegion,
): Promise<SubMenuOutcome> {
  while (true) {
    const items = [
      ...INTEGRATIONS.map((i) => ({ id: i.id, label: i.label, hint: i.hint })),
      { id: "back" as const, label: "Back to main menu" },
    ];

    const choice = await prompter.choice<MenuChoice>(
      "Choose an integration",
      items,
      { region, header: buildHeader() },
    );

    if (choice === "back") return "main";

    // Long-running flow: drop out of the in-place region so progress
    // text and the post-run prompt land in scrollback.
    region.pause();

    if (choice === "clickup") {
      await runClickUpFlow(choice, prompter);
    } else {
      const mock = getIntegrationMock(choice);
      await runMockExport(mock, prompter);
    }

    const next = await promptPostRun(prompter, {
      againLabel: "Export to another tracker",
      againHint: "Pick another integration",
      defaultId: "again",
    });

    if (next === "main") return "main";
    if (next === "exit") return "exit";
    // "again" → loop and re-render the picker via the region (now
    // anchored just below whatever the export wrote).
  }
}

async function runClickUpFlow(choice: IntegrationId, prompter: Prompter): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch {
    // Config missing — fall back to demo
    const mock = getIntegrationMock(choice);
    await runMockExport(mock, prompter);
    return;
  }

  const clickupCfg = config.integrations?.clickup;
  if (!clickupCfg?.token) {
    stdout.write(
      `\n  ${paint.yellow("!")} No ClickUp token configured.\n` +
        `  Add ${paint.bold("[integrations.clickup]")} to ${paint.bold(config.sourcePath)} ` +
        `and set ${paint.bold("token = \"pk_…\"")}.\n` +
        `  Running demo mode instead.\n\n`,
    );
    const mock = getIntegrationMock(choice);
    await runMockExport(mock, prompter);
    return;
  }

  stdout.write("\n");
  const sourcePath = cleanPathString(
    await prompter.text("  Document path (.md, .pdf, .docx)", { required: true }),
  );

  stdout.write("\n");
  try {
    const tree = await runExtract({ sourcePath });
    const parentCount = tree.phases.reduce(
      (n, p) => n + p.epics.reduce((m, e) => m + e.tasks.length, 0),
      0,
    );
    if (parentCount === 0) {
      stdout.write(`  ${paint.yellow("!")} No tasks were extracted. Nothing to push.\n\n`);
      return;
    }
    await runClickUpExport({
      config: clickupCfg,
      tree,
      sourcePath,
      prompter,
    });
  } catch (err: unknown) {
    stdout.write(
      `\n  ${paint.red("✗")} ${(err as Error).message}\n\n`,
    );
  }
}

function buildHeader(): string {
  const title = `${paint.bold("\u25C6 Task exporter")}\n`;
  const blurb = paint.dim(
    "  Push work items from this repo to your tracker of choice.\n",
  );
  return `${title}${blurb}\n`;
}
