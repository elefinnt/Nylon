import { stderr } from "node:process";

import { parseArgv } from "./argv.js";
import type { CliCommand } from "./argv.js";
import { runHelpCommand, runVersionCommand } from "./commands/help.js";
import { runInitCommand } from "./commands/init.js";
import { runMenuCommand } from "./commands/menu.js";
import { runProvidersCommand } from "./commands/providers.js";
import { runReviewCommand } from "./commands/review.js";
import { paint } from "./render.js";

export type CliRunOutcome =
  | { kind: "ipc" }
  | { kind: "exit"; code: number };

export async function runCli(argv: readonly string[]): Promise<CliRunOutcome> {
  const parsed = parseArgv(argv);

  if (parsed.kind === "ipc") {
    return { kind: "ipc" };
  }

  if (parsed.kind === "error") {
    stderr.write(`${paint.red("✗")} ${parsed.message}\n`);
    stderr.write(`  Run ${paint.bold("pr-review --help")} for usage.\n`);
    return { kind: "exit", code: parsed.exitCode };
  }

  const code = await dispatch(parsed.command);
  return { kind: "exit", code };
}

async function dispatch(command: CliCommand): Promise<number> {
  switch (command.kind) {
    case "help":
      return runHelpCommand(command.topic);
    case "version":
      return runVersionCommand();
    case "init":
      return runInitCommand({ force: command.force, fromEnv: command.fromEnv });
    case "providers":
      return runProvidersCommand();
    case "menu":
      return runMenuCommand();
    case "review": {
      const input = {
        url: command.url,
        dry: command.dry,
        verbose: command.verbose,
      } as Parameters<typeof runReviewCommand>[0];
      if (command.provider !== undefined) input.provider = command.provider;
      if (command.model !== undefined) input.model = command.model;
      return runReviewCommand(input);
    }
  }
}
