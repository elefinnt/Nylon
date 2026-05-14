import type { LiveRegion } from "../live-region.js";
import type { Prompter } from "../prompts.js";
import { paint } from "../render.js";
import { listSkills } from "../../skills/registry.js";
import type { Skill, SkillStage } from "../../skills/types.js";
import type { SubMenuOutcome } from "./post-run.js";

const STAGE_LABELS: Record<SkillStage, string> = {
  review: "review",
  "task-extract": "task extract",
};

const STAGE_CONFIG_SECTION: Record<SkillStage, string> = {
  review: "[review]",
  "task-extract": "[extract]",
};

export async function runSkillsMenu(
  prompter: Prompter,
  region: LiveRegion,
): Promise<SubMenuOutcome> {
  const available = listSkills();

  while (true) {
    const items: Array<{ id: string; label: string; hint?: string }> = [
      ...available.map(s => ({
        id: s.id,
        label: s.displayName,
        hint: buildItemHint(s),
      })),
      { id: "back", label: "Back to main menu" },
    ];

    const choice = await prompter.choice<string>(
      "Skills",
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
        header: buildSkillHeader(skill),
      },
    );
  }
}

function buildItemHint(skill: Skill): string {
  const stage = skill.stage[0] ?? "review";
  const tag = STAGE_LABELS[stage];
  const flag = skill.experimental ? "beta" : skill.addedInVersion;
  return `${tag} · ${flag}`;
}

function buildHeader(): string {
  return (
    `${paint.bold("\u25C6 Skills")}\n` +
    paint.dim("  Composable lenses that shape what Nylon does on each run.\n") +
    paint.dim("  Review skills sharpen PR feedback; task-extract skills decompose\n") +
    paint.dim("  documents into trackable tickets.\n\n")
  );
}

function buildSkillHeader(skill: Skill): string {
  const stage = skill.stage[0] ?? "review";
  const section = STAGE_CONFIG_SECTION[stage];
  return (
    `${paint.bold(skill.displayName)}  ${paint.dim(`(${STAGE_LABELS[stage]})`)}\n\n` +
    `  ${skill.description}\n\n` +
    `  ${paint.dim("Enable by adding")} ${paint.bold(`"${skill.id}"`)} ` +
    `${paint.dim(`to skills in ${section} of config.toml`)}\n\n`
  );
}
