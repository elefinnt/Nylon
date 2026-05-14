import { stdin, stdout } from "node:process";

import { runMainMenu } from "../menu/main-menu.js";
import { Prompter } from "../prompts.js";
import { paint } from "../render.js";

/**
 * Interactive main menu. Loops until Exit (or Ctrl+C). Requires a TTY; in
 * non-interactive contexts callers should use explicit subcommands instead.
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
