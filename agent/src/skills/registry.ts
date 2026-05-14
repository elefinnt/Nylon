import { CATALOGUE } from "./catalogue.js";
import type { Skill, SkillStage } from "./types.js";

export function listSkills(stage?: SkillStage): Skill[] {
return stage ? CATALOGUE.filter(s => s.stage.includes(stage)) : [...CATALOGUE];
}

export function getSkill(id: string) : Skill {
    const s = CATALOGUE.find(s => s.id === id);
    if (!s) {
        throw new Error(`Unknown skill id: ${id}. Known: ${CATALOGUE.map(s => s.id).join(", ")}`);
    }
    return s;
}

export function resolveSkills(ids: readonly string[]): Skill[] {
    return ids.map(id => getSkill(id));
}

export function filterValidSkillIds(ids: readonly string[]): string[] {
    const known = new Set(CATALOGUE.map(s => s.id));
    return ids.filter(id => known.has(id));
}

export function hasPipelineSkills(skills: readonly Skill[]): boolean {
    const stages = new Set(skills.map(s => s.pipelineStage).filter(Boolean));
    return stages.has("intent") && stages.has("inline-review") && stages.has("synthesis");
}