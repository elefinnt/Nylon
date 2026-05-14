import type { LiveRegion } from "../live-region.js";
import type { Prompter } from "../prompts.js";
import { paint } from "../render.js";
import type { SubMenuOutcome } from "./post-run.js";

/**
 * Sub-menu shown after picking "PR agent" on the main menu. Each item
 * is a navigation stub for now - the actual review/init/providers
 * flows still live behind their own top-level commands. The hint
 * column tells the user which subcommand to run today.
 *
 * The whole sub-menu lives inside the parent's {@link LiveRegion} so
 * navigating into and back out of it swaps the visible screen in place
 * rather than scrolling new content into view.
 */
const ACTIONS = [
  {
    id: "review",
    label: "Review a pull request",
    hint: "nylon <pr-url>",
  },
  {
    id: "configure",
    label: "Configure credentials",
    hint: "nylon init",
  },
  {
    id: "providers",
    label: "List providers and models",
    hint: "nylon providers",
  },
] as const;

type ActionId = (typeof ACTIONS)[number]["id"] | "back";

export async function runPrAgentMenu(
  prompter: Prompter,
  region: LiveRegion,
): Promise<SubMenuOutcome> {
  let notice: string | undefined;

  while (true) {
    const items = [
      ...ACTIONS.map((a) => ({ id: a.id, label: a.label, hint: a.hint })),
      { id: "back" as const, label: "Back to main menu" },
    ];

    const choice = await prompter.choice<ActionId>("Choose an action", items, {
      region,
      header: buildHeader(notice),
    });
    notice = undefined;

    if (choice === "back") return "main";

    const picked = ACTIONS.find((a) => a.id === choice);
    if (!picked) continue;

    notice =
      `${paint.yellow("!")} ${paint.bold(picked.label)} ${paint.dim("is not wired into the menu yet.")}\n` +
      paint.dim(`  Run \`${picked.hint}\` directly for now.\n`);
  }
}

function buildHeader(notice: string | undefined): string {
  const title = `${paint.bold("\u25C6 PR agent")}\n`;
  const blurb = paint.dim("  AI code reviews on GitHub pull requests.\n");
  const noticeBlock = notice ? `\n${notice}` : "";
  return `${title}${blurb}${noticeBlock}\n`;
}
