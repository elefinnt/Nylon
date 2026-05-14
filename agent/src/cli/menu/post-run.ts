import { stdout } from "node:process";

import type { Prompter } from "../prompts.js";
import { paint } from "../render.js";

/**
 * What a successful sub-menu action should do once the user has finished
 * with it. Returned by {@link promptPostRun} and bubbled up from sub-menus
 * so a single "Exit" choice can short-circuit the entire menu stack.
 */
export type PostRunChoice = "again" | "main" | "exit";

/**
 * Result of running a sub-menu. `"main"` means we've finished with this
 * section and want to redraw the top-level menu; `"exit"` means the user
 * asked to leave the CLI entirely and the main menu should unwind.
 */
export type SubMenuOutcome = "main" | "exit";

export interface PostRunOptions {
  /** What "Run another" should literally say, e.g. "Export to another tracker". */
  againLabel: string;
  /** Optional hint shown next to the "Run another" option. */
  againHint?: string;
  /** Which option to highlight by default. Defaults to `"again"`. */
  defaultId?: PostRunChoice;
}

/**
 * Prompt rendered after a successful action inside a sub-menu. Closes off
 * the previous output with a faint divider, then asks the user where to
 * go next. Callers choose the verb ("Export to another tracker", "Review
 * another PR") and the default highlight, so this stays agnostic about
 * which sub-menu it's serving.
 */
export async function promptPostRun(
  prompter: Prompter,
  opts: PostRunOptions,
): Promise<PostRunChoice> {
  stdout.write(
    "\n" + paint.dim("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500") + "\n\n",
  );

  const items: ReadonlyArray<{ id: PostRunChoice; label: string; hint?: string }> = [
    {
      id: "again",
      label: opts.againLabel,
      ...(opts.againHint ? { hint: opts.againHint } : {}),
    },
    { id: "main", label: "Back to main menu" },
    { id: "exit", label: "Exit" },
  ];

  return prompter.choice<PostRunChoice>("What next?", items, {
    defaultId: opts.defaultId ?? "again",
  });
}
