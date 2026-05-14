import type { LiveRegion } from "../live-region.js";
import type { Prompter } from "../prompts.js";
import { paint } from "../render.js";
import { getIntegrationMock, type IntegrationId } from "./task-exporter-data.js";
import { runMockExport } from "./task-exporter-mock.js";
import { promptPostRun, type SubMenuOutcome } from "./post-run.js";

/**
 * Sub-menu for the task exporter section. The integrations themselves
 * are not wired to real providers yet, so picking one runs a scripted
 * demo flow that mirrors the eventual UX (connect → scan → map →
 * push → summarise).
 *
 * The integration picker shares the parent's {@link LiveRegion} so it
 * swaps in place over the main menu. When the user actually triggers
 * an export, the region is paused so the long-running mock output
 * lands in scrollback as before; the next picker render starts fresh
 * underneath whatever the export wrote.
 */
const INTEGRATIONS = [
  { id: "monday", label: "Monday.com", hint: "Export to Monday boards" },
  { id: "jira", label: "Jira", hint: "Export to Jira issues" },
  { id: "clickup", label: "ClickUp", hint: "Export to ClickUp tasks" },
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
    const mock = getIntegrationMock(choice);
    await runMockExport(mock, prompter);

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

function buildHeader(): string {
  const title = `${paint.bold("\u25C6 Task exporter")}\n`;
  const blurb = paint.dim(
    "  Push work items from this repo to your tracker of choice.\n",
  );
  return `${title}${blurb}\n`;
}
