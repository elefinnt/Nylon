import type { LiveRegion } from "../live-region.js";
import type { Prompter } from "../prompts.js";
import { paint } from "../render.js";
import { listSkills } from "../../skills/registry.js";
import type { SubMenuOutcome } from "./post-run.js";

export async function runSkillsMenu(
  prompter: Prompter,
  region: LiveRegion,
): Promise<SubMenuOutcome> {
  const available = listSkills("review");

  while (true) {
    const items: Array<{ id: string; label: string; hint?: string }> = [
      ...available.map(s => ({
        id: s.id,
        label: s.displayName,
        hint: s.experimental ? "beta" : s.addedInVersion,
      })),
      { id: "back", label: "Back to main menu" },
    ];

    const choice = await prompter.choice<string>(
      "Review skills",
      items,
      { region, header: buildHeader() },
    );

    if (choice === "back") return "main";

    const skill = available.find(s => s.id === choice);
    if (!skill) continue;

    await prompter.choice<"back">(
      skill.displayName,
      [{ id: "back", label: "Back to skills" }],
      {
        region,
        header: buildSkillHeader(skill.displayName, skill.description, skill.id),
      },
    );
  }
}

function buildHeader(): string {
  return (
    `${paint.bold("\u25C6 Skills")}\n` +
    paint.dim("  Composable capabilities that improve PR review quality.\n") +
    paint.dim("  To enable: add skill IDs to [review] skills in your config.toml\n\n")
  );
}

function buildSkillHeader(name: string, description: string, id: string): string {
  return (
    `${paint.bold(name)}\n\n` +
    `  ${description}\n\n` +
    `  ${paint.dim("Enable by adding")} ${paint.bold(`"${id}"`)} ${paint.dim("to [review] skills in config.toml")}\n\n`
  );
}
