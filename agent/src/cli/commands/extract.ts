import { stdin, stdout } from "node:process";

import { loadConfig } from "../../config.js";
import { renderTicketTreePlan, runClickUpExport } from "../../integrations/clickup/export.js";
import { runExtract } from "../../pipeline/extract-orchestrator.js";
import { AgentError, toAgentError } from "../../util/errors.js";
import { cleanPathString } from "../../util/paths.js";
import { Prompter } from "../prompts.js";
import { paint } from "../render.js";

export interface ExtractCommandInput {
  filePath: string;
  provider?: string;
  model?: string;
  dry: boolean;
}

/**
 * `nylon extract` — same pipeline as Task exporter → ClickUp: read document,
 * run the five-agent SOW → ticket tree pass, then confirm and push (unless --dry).
 */
export async function runExtractCommand(input: ExtractCommandInput): Promise<number> {
  let config;
  try {
    config = loadConfig();
  } catch (err: unknown) {
    const e = toAgentError(err);
    stdout.write(
      `${paint.red("✗")} ${paint.bold(e.code)}: ${e.message}\n` +
        `  Run ${paint.bold("nylon init")} first.\n`,
    );
    return 2;
  }

  const sourcePath = cleanPathString(input.filePath);

  stdout.write(
    `${paint.bold("nylon extract")}` +
      `${input.dry ? ` ${paint.dim("(dry run — no ClickUp push)")}` : ""}\n` +
      `  ${paint.dim("Document:")} ${sourcePath}\n\n`,
  );

  try {
    const tree = await runExtract({
      sourcePath,
      provider: input.provider,
      model: input.model,
    });

    if (input.dry) {
      const { totalParents } = renderTicketTreePlan(tree);
      if (totalParents === 0) {
        stdout.write(`  ${paint.yellow("!")} No tasks were extracted.\n\n`);
      } else {
        stdout.write(`  ${paint.dim("·")} Dry run finished — no tasks sent to ClickUp.\n\n`);
      }
      return 0;
    }

    if (!stdin.isTTY) {
      stdout.write(
        `${paint.red("✗")} Pushing to ClickUp needs an interactive terminal.\n` +
          `  Run with ${paint.bold("--dry")} to extract and preview the plan only, ` +
          `or use ${paint.bold("nylon menu")} → Task exporter.\n`,
      );
      return 2;
    }

    const clickupCfg = config.integrations?.clickup;
    if (!clickupCfg?.token) {
      stdout.write(
        `${paint.red("✗")} No ClickUp token configured.\n` +
          `  Add ${paint.bold("[integrations.clickup]")} to ${paint.bold(config.sourcePath)} ` +
          `with ${paint.bold("token = \"pk_…\"")} (and optionally ${paint.bold("default_list_id")}).\n`,
      );
      return 2;
    }

    const prompter = new Prompter();
    try {
      await runClickUpExport({
        config: clickupCfg,
        tree,
        sourcePath,
        prompter,
      });
      return 0;
    } finally {
      prompter.close();
    }
  } catch (err: unknown) {
    const e = err instanceof AgentError ? err : toAgentError(err);
    stdout.write(`${paint.red("✗")} ${paint.bold(e.code)}: ${e.message}\n`);
    return 1;
  }
}
