import { stdout } from "node:process";

import { version as pkgVersion } from "../../version.js";
import { paint } from "../render.js";

const TOPICS: Record<string, string> = {
  init:
    `${paint.bold("nylon init")}\n\n` +
    `  Walks you through entering your GitHub Personal Access Token,\n` +
    `  picking a provider (Cursor / OpenAI / Anthropic), and pasting the\n` +
    `  matching API key. Writes ~/.nylon/config.toml.\n\n` +
    `  If GITHUB_TOKEN, OPENAI_API_KEY, ANTHROPIC_API_KEY or CURSOR_API_KEY\n` +
    `  are already in the environment (or in a .env file in the current\n` +
    `  directory) the matching prompt is skipped automatically.\n\n` +
    `  Options:\n` +
    `    -f, --force         Skip the "config already exists" warning.\n` +
    `        --from-env      Don't prompt at all - take everything from env.\n` +
    `                        Requires GITHUB_TOKEN and one *_API_KEY.\n` +
    `                        Use NYLON_PROVIDER if multiple keys are set.\n`,

  providers:
    `${paint.bold("nylon providers")}\n\n` +
    `  Lists the providers and models the agent knows about.\n`,

  menu:
    `${paint.bold("nylon")}\n\n` +
    `  With no arguments, in an interactive terminal, opens the main menu.\n\n` +
    `  Sections include ${paint.bold("PR agent")}, ${paint.bold("Task exporter")}\n` +
    `  (ClickUp when configured), ${paint.bold("Skills")}, and more.\n\n` +
    `  Navigate with arrow keys (or number shortcuts), confirm with Enter,\n` +
    `  and exit with Ctrl+C. Requires an interactive terminal.\n`,

  cat:
    `${paint.bold("nylon cat")}\n\n` +
    `  Plays a looping ASCII cat animation in your terminal until you press\n` +
    `  ${paint.bold("q")} or ${paint.bold("Ctrl+C")}. Requires an interactive terminal.\n`,

  review:
    `${paint.bold("nylon review <pr-url>")} (alias: ${paint.bold("nylon <pr-url>")})\n\n` +
    `  Runs an AI code review against a GitHub pull request. By default\n` +
    `  the review IS posted to the PR (matching your config). Use --dry to\n` +
    `  preview without posting.\n\n` +
    `  Options:\n` +
    `    -n, --dry              Run the review but don't post.\n` +
    `    -p, --provider <id>    Override the configured provider.\n` +
    `    -m, --model <id>       Override the configured model.\n` +
    `    -v, --verbose          Show debug logs from the agent.\n`,

  extract:
    `${paint.bold("nylon extract <file-path>")}\n\n` +
    `  Reads a local document (.md, .pdf, .docx) and runs the same five-agent\n` +
    `  SOW → ticket pipeline as Task exporter → ClickUp. With a ClickUp token\n` +
    `  configured, you can confirm and push tasks interactively. Use --dry to\n` +
    `  run the pipeline and preview the plan without pushing.\n\n` +
    `  Options:\n` +
    `    -n, --dry              Extract only; do not push to ClickUp.\n` +
    `    -p, --provider <id>    Override the configured provider.\n` +
    `    -m, --model <id>       Override the configured model.\n`,
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
  stdout.write(`nylon ${pkgVersion}\n`);
  return 0;
}

function renderRootHelp(): string {
  return [
    `${paint.bold("nylon")} - post AI code reviews onto GitHub pull requests`,
    "",
    `${paint.bold("Usage")}`,
    `  nylon                            ${paint.dim("Open the interactive menu (TTY only)")}`,
    `  nylon cat                        ${paint.dim("ASCII cat animation until you quit")}`,
    `  nylon init                       ${paint.dim("Set up GitHub token + provider key (interactive)")}`,
    `  nylon providers                  ${paint.dim("List providers and models")}`,
    `  nylon review <pr-url> [flags]    ${paint.dim("Run a review")}`,
    `  nylon extract <path> [flags]      ${paint.dim("Extract document → ClickUp tasks")}`,
    `  nylon <pr-url> [flags]           ${paint.dim("Same as `review <pr-url>`")}`,
    "",
    `${paint.bold("Common flags")}`,
    `  -n, --dry              Don't post the review back to GitHub`,
    `  -p, --provider <id>    Override the configured provider`,
    `  -m, --model <id>       Override the configured model`,
    `  -v, --verbose          Show debug logs`,
    `  -h, --help [topic]     Show help (try ${paint.bold("nylon help review")})`,
    `  -V, --version          Print the version`,
    "",
    `${paint.bold("Examples")}`,
    `  nylon init`,
    `  nylon https://github.com/acme/widgets/pull/42 --dry`,
    `  nylon review https://github.com/acme/widgets/pull/42 -p openai`,
    `  nylon extract ./scope/spec.md --dry`,
    "",
  ].join("\n") + "\n";
}
