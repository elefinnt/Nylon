import { Skill } from "../types.js";


export class IntentAnalysisSkill  implements Skill {
    readonly id = "intent-analysis";
    readonly displayName = "Intent analysis";
    readonly description = "Pre-pass that extracts what the PR is trying to accomplish before teh diff is reviewed. Improves accuracy opn large or complex PRs.";
    readonly stage = ["review"] as const;
    readonly addedInVersion = "0.2.0";
    readonly  pipelineStage = "intent" as const;
    
    toSystemPromptBlock(): string {
        return `## Intent analysis pass
    Analyse only the PR title, description, and file list.
    Produce a concise plain-text document (no JSON, under 200 words) describing:
    1. What the PR is trying to accomplish.
    2. A brief note on each group of changed files and their role in the goal.`;
      }
    }