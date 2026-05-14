import { stdin, stdout } from "node:process";

import { runMainMenu } from "../menu/main-menu.js";
import { Prompter } from "../prompts.js";
import { paint } from "../render.js";

/**
 * `nylon menu` - interactive entry point. Opens the main menu and loops
 * until the user picks Exit (or hits Ctrl+C). Requires a TTY because every
 * action is a prompt; in non-interactive contexts we tell the user to call
 * the per-command surface instead.
 */
export async function runMenuCommand(): Promise<number> {
  if (!stdin.isTTY) {
    stdout.write(
      `${paint.red("\u2717")} The menu needs an interactive terminal.\n` +
        paint.dim(
          "  Pipe-driven sessions should call subcommands directly (try `nylon --help`).\n",
        ),
    );
    return 2;
  }

  const prompter = new Prompter();
  try {
    await runMainMenu(prompter);
    stdout.write(`\n${paint.dim("Closing down... bye!")}\n`);
    return 0;
  } finally {
    prompter.close();
  }
}
