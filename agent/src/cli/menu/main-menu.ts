import { renderBanner } from "../anim/index.js";
import { LiveRegion } from "../live-region.js";
import type { Prompter } from "../prompts.js";
import { paint } from "../render.js";
import { runPrAgentMenu } from "./pr-agent-menu.js";
import { runTaskExporterMenu } from "./task-exporter-menu.js";

type MainChoice = "pr-agent" | "task-exporter" | "exit";

/**
 * Renders the top-level menu and dispatches into the chosen sub-menu.
 * The NYLON banner is printed once into scrollback at the top, then a
 * single {@link LiveRegion} is created beneath it and shared across all
 * menu screens. Picking a sub-menu replaces the region's contents in
 * place rather than appending another menu underneath it.
 */
export async function runMainMenu(prompter: Prompter): Promise<void> {
  await renderBanner("Your CLI swiss-army knife: PR reviews, task tracker sync, and more.");

  const region = new LiveRegion();
  try {
    while (true) {
      const choice = await prompter.choice<MainChoice>(
        "Main menu",
        [
          {
            id: "pr-agent",
            label: "PR agent",
            hint: "AI reviews on GitHub pull requests",
          },
          {
            id: "task-exporter",
            label: "Task exporter",
            hint: "Sync with Monday, Jira, ClickUp",
          },
          { id: "exit", label: "Exit" },
        ],
        { region, header: mainMenuHeader() },
      );

      switch (choice) {
        case "pr-agent": {
          const outcome = await runPrAgentMenu(prompter, region);
          if (outcome === "exit") return;
          break;
        }
        case "task-exporter": {
          const outcome = await runTaskExporterMenu(prompter, region);
          if (outcome === "exit") return;
          break;
        }
        case "exit":
          return;
      }
    }
  } finally {
    region.close();
  }
}

function mainMenuHeader(): string {
  return `${paint.bold("\u25C6 NYLON")}\n${paint.dim("  Pick a section to dive into.")}\n\n`;
}
