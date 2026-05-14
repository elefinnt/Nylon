export type SkillStage = "review" | "task-extract";

export type PipelineStage = "intent" | "inline-review" | "synthesis";

export interface SkillMeta {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly stage: ReadonlyArray<SkillStage>;
  readonly addedInVersion: string;
  readonly experimental?: boolean;
  readonly pipelineStage?: PipelineStage;
}

export interface Skill extends SkillMeta {
  toSystemPromptBlock(): string;
}
