import { stdout } from "node:process";

import { version as pkgVersion } from "../../version.js";
import { paint } from "../render.js";

const TOPICS: Record<string, string> = {
  init:
    `${paint.bold("pr-review init")}\n\n` +
    `  Walks you through entering your GitHub Personal Access Token,\n` +
    `  picking a provider (Cursor / OpenAI / Anthropic), and pasting the\n` +
    `  matching API key. Writes ~/.pr-agent/config.toml.\n\n` +
    `  If GITHUB_TOKEN, OPENAI_API_KEY, ANTHROPIC_API_KEY or CURSOR_API_KEY\n` +
    `  are already in the environment (or in a .env file in the current\n` +
    `  directory) the matching prompt is skipped automatically.\n\n` +
    `  Options:\n` +
    `    -f, --force         Skip the "config already exists" warning.\n` +
    `        --from-env      Don't prompt at all - take everything from env.\n` +
    `                        Requires GITHUB_TOKEN and one *_API_KEY.\n` +
    `                        Use PR_AGENT_PROVIDER if multiple keys are set.\n`,

  providers:
    `${paint.bold("pr-review providers")}\n\n` +
    `  Lists the providers and models the agent knows about.\n`,

  menu:
    `${paint.bold("pr-review menu")}\n\n` +
    `  Opens an interactive main menu with two sections:\n` +
    `    - ${paint.bold("PR agent")}       AI code reviews on GitHub pull requests.\n` +
    `    - ${paint.bold("Task exporter")}  Sync work items with Monday, Jira, ClickUp.\n\n` +
    `  Navigate with arrow keys (or number shortcuts), confirm with Enter,\n` +
    `  and exit with Ctrl+C. Requires an interactive terminal.\n`,

  review:
    `${paint.bold("pr-review review <pr-url>")} (alias: ${paint.bold("pr-review <pr-url>")})\n\n` +
    `  Runs an AI code review against a GitHub pull request. By default\n` +
    `  the review IS posted to the PR (matching your config). Use --dry to\n` +
    `  preview without posting.\n\n` +
    `  Options:\n` +
    `    -n, --dry              Run the review but don't post.\n` +
    `    -p, --provider <id>    Override the configured provider.\n` +
    `    -m, --model <id>       Override the configured model.\n` +
    `    -v, --verbose          Show debug logs from the agent.\n`,
};

export function runHelpCommand(topic?: string): number {
  if (topic && TOPICS[topic]) {
    stdout.write(TOPICS[topic] + "\n");
    return 0;
  }
  stdout.write(renderRootHelp());
  return 0;
}

export function runVersionCommand(): number {
  stdout.write(`pr-review ${pkgVersion}\n`);
  return 0;
}

function renderRootHelp(): string {
  return [
    `${paint.bold("pr-review")} - post AI code reviews onto GitHub pull requests`,
    "",
    `${paint.bold("Usage")}`,
    `  pr-review menu                       ${paint.dim("Open the interactive main menu")}`,
    `  pr-review init                       ${paint.dim("Set up GitHub token + provider key (interactive)")}`,
    `  pr-review providers                  ${paint.dim("List providers and models")}`,
    `  pr-review review <pr-url> [flags]    ${paint.dim("Run a review")}`,
    `  pr-review <pr-url> [flags]           ${paint.dim("Same as `review <pr-url>`")}`,
    "",
    `${paint.bold("Common flags")}`,
    `  -n, --dry              Don't post the review back to GitHub`,
    `  -p, --provider <id>    Override the configured provider`,
    `  -m, --model <id>       Override the configured model`,
    `  -v, --verbose          Show debug logs`,
    `  -h, --help [topic]     Show help (try ${paint.bold("pr-review help review")})`,
    `  -V, --version          Print the version`,
    "",
    `${paint.bold("Examples")}`,
    `  pr-review init`,
    `  pr-review https://github.com/acme/widgets/pull/42 --dry`,
    `  pr-review review https://github.com/acme/widgets/pull/42 -p openai`,
    "",
  ].join("\n") + "\n";
}
