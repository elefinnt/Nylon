import { stdout } from "node:process";

import { looksLikeUrl } from "../argv.js";
import { runReviewCommand } from "../commands/review.js";
import type { LiveRegion } from "../live-region.js";
import type { Prompter } from "../prompts.js";
import { paint } from "../render.js";
import { promptPostRun, type SubMenuOutcome } from "./post-run.js";

/**
 * Sub-menu shown after picking "PR agent" on the main menu. Starts the
 * same review pipeline as `nylon review <url>`.
 *
 * The whole sub-menu lives inside the parent's {@link LiveRegion} so
 * navigating into and back out of it swaps the visible screen in place
 * rather than scrolling new content into view.
 */
type ActionId = "review" | "back";

export async function runPrAgentMenu(
  prompter: Prompter,
  region: LiveRegion,
): Promise<SubMenuOutcome> {
  while (true) {
    const choice = await prompter.choice<ActionId>(
      "Choose an action",
      [
        {
          id: "review",
          label: "Review a pull request",
          hint: "paste a GitHub PR URL",
        },
        { id: "back", label: "Back to main menu" },
      ],
      { region, header: buildHeader() },
    );

    if (choice === "back") return "main";

    region.pause();
    const next = await runReviewFromMenu(prompter);
    if (next === "main") return "main";
    if (next === "exit") return "exit";
  }
}

/** `"main"` / `"exit"` bubble up; `null` means review another PR (stay in sub-menu). */
async function runReviewFromMenu(prompter: Prompter): Promise<SubMenuOutcome | null> {
  stdout.write("\n");
  let url = "";
  while (true) {
    url = (await prompter.text("  Pull request URL", { required: true })).trim();
    if (looksLikeUrl(url)) break;
    stdout.write(
      paint.warn(`  \`${url}\` does not look like a GitHub pull request URL.\n`),
    );
  }

  stdout.write("\n");
  await runReviewCommand({ url, dry: false, verbose: false });

  const next = await promptPostRun(prompter, {
    againLabel: "Review another pull request",
    againHint: "Same flow as nylon review",
    defaultId: "again",
  });
  if (next === "main") return "main";
  if (next === "exit") return "exit";
  return null;
}

function buildHeader(): string {
  const title = `${paint.bold("\u25C6 PR agent")}\n`;
  const blurb = paint.dim("  AI code reviews on GitHub pull requests.\n");
  return `${title}${blurb}\n`;
}
