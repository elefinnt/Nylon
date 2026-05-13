import { existsSync } from "node:fs";
import { stdout } from "node:process";

import { defaultConfigPath } from "../../config.js";
import { Prompter } from "../prompts.js";
import { paint } from "../render.js";
import { runInitWizard } from "../wizard.js";

export async function runInitCommand(opts: { force: boolean }): Promise<number> {
  const target = defaultConfigPath();
  const exists = existsSync(target);

  if (exists && !opts.force) {
    stdout.write(
      `${paint.yellow("!")} A config already exists at ${paint.bold(target)}.\n` +
        `  This will ${paint.bold("overwrite")} it. Press Ctrl+C to cancel,\n` +
        `  or rerun with ${paint.bold("--force")} to skip this check next time.\n\n`,
    );
  }

  const prompter = new Prompter();
  try {
    const result = await runInitWizard(prompter, { path: target });
    stdout.write(
      `\n${paint.green("✓")} Saved to ${paint.bold(result.path)}\n` +
        `  Provider: ${paint.bold(result.providerId)}` +
        (result.modelId ? `   Model: ${paint.bold(result.modelId)}` : "") +
        "\n\n" +
        paint.dim("  Try it: ") +
        paint.bold("pr-review review <pr-url> --dry") +
        "\n",
    );
    return 0;
  } finally {
    prompter.close();
  }
}
