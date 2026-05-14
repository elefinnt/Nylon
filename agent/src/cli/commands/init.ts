import { existsSync } from "node:fs";
import { stdout } from "node:process";

import { defaultConfigPath } from "../../config.js";
import { toAgentError } from "../../util/errors.js";
import { discoverFromEnvironment } from "../env.js";
import { Prompter } from "../prompts.js";
import { paint } from "../render.js";
import { runInitWizard } from "../wizard.js";
import type { WizardOptions } from "../wizard.js";

export async function runInitCommand(opts: { force: boolean; fromEnv: boolean }): Promise<number> {
  const target = defaultConfigPath();
  const exists = existsSync(target);

  if (exists && !opts.force) {
    stdout.write(
      `${paint.yellow("!")} A config already exists at ${paint.bold(target)}.\n` +
        `  This will ${paint.bold("overwrite")} it. Press Ctrl+C to cancel,\n` +
        `  or rerun with ${paint.bold("--force")} to skip this check next time.\n\n`,
    );
  }

  const env = discoverFromEnvironment();

  try {
    if (opts.fromEnv) {
      return await runWizard(undefined, { path: target, env, fromEnvOnly: true });
    }
    const prompter = new Prompter();
    try {
      return await runWizard(prompter, { path: target, env });
    } finally {
      prompter.close();
    }
  } catch (err: unknown) {
    const e = toAgentError(err);
    stdout.write(`\n${paint.red("✗")} ${paint.bold(e.code)}: ${e.message}\n`);
    return 2;
  }
}

async function runWizard(prompter: Prompter | undefined, opts: WizardOptions): Promise<number> {
  // When fromEnvOnly is set we never prompt, but the wizard still needs a
  // Prompter handle to satisfy its signature. Pass a stub that throws if
  // anyone tries to use it, so a regression is loud.
  const safePrompter = prompter ?? stubPrompter();
  const result = await runInitWizard(safePrompter, opts);
  stdout.write(
    `\n${paint.green("✓")} Saved to ${paint.bold(result.path)}\n` +
      `  Provider: ${paint.bold(result.providerId)}` +
      (result.modelId ? `   Model: ${paint.bold(result.modelId)}` : "") +
      "\n\n" +
      paint.dim("  Try it: ") +
      paint.bold("nylon review <pr-url> --dry") +
      "\n",
  );
  return 0;
}

function stubPrompter(): Prompter {
  const fail = (): never => {
    throw new Error("Prompter used in --from-env mode (this is a bug).");
  };
  return {
    close() {},
    text: fail,
    secret: fail,
    confirm: fail,
    choice: fail,
  } as unknown as Prompter;
}
