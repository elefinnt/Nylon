import { z } from "zod";

// ── Stage 1: SOW Intelligence Extractor ─────────────────────────────

export const functionalAreaSchema = z.object({
  name: z.string().min(1),
  requirements: z.array(z.string()).default([]),
  notes: z.string().optional(),
});

export const projectUnderstandingSchema = z.object({
  projectName: z.string().min(1),
  summary: z.string().min(1),
  domains: z.array(z.string()).default([]),
  functionalAreas: z.array(functionalAreaSchema).default([]),
  integrations: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  outOfScope: z.array(z.string()).default([]),
});

export type FunctionalArea = z.infer<typeof functionalAreaSchema>;
export type ProjectUnderstanding = z.infer<typeof projectUnderstandingSchema>;

// ── Stage 2: Solution Architect ─────────────────────────────────────

export const moduleLayerSchema = z.enum([
  "frontend",
  "backend",
  "infra",
  "integration",
  "data",
  "qa",
  "design",
  "ops",
]);

export type ModuleLayer = z.infer<typeof moduleLayerSchema>;

export const projectModuleSchema = z.object({
  name: z.string().min(1),
  layer: moduleLayerSchema,
  purpose: z.string().min(1),
  dependencies: z.array(z.string()).default([]),
  coversAreas: z.array(z.string()).default([]),
});

export const projectBlueprintSchema = z.object({
  modules: z.array(projectModuleSchema).default([]),
  architecturalNotes: z.string().default(""),
});

export type ProjectModule = z.infer<typeof projectModuleSchema>;
export type ProjectBlueprint = z.infer<typeof projectBlueprintSchema>;

// ── Stage 3: Delivery Planner ───────────────────────────────────────

export const epicPlanSchema = z.object({
  name: z.string().min(1),
  summary: z.string().min(1),
  moduleRefs: z.array(z.string()).default([]),
});

export const phasePlanSchema = z.object({
  name: z.string().min(1),
  goal: z.string().min(1),
  epics: z.array(epicPlanSchema).default([]),
});

export const deliveryStructureSchema = z.object({
  phases: z.array(phasePlanSchema).default([]),
  rationale: z.string().default(""),
});

export type EpicPlan = z.infer<typeof epicPlanSchema>;
export type PhasePlan = z.infer<typeof phasePlanSchema>;
export type DeliveryStructure = z.infer<typeof deliveryStructureSchema>;

// ── Stage 4 & 5: Ticket tree (generated then validated) ─────────────

export const ticketPrioritySchema = z.enum(["urgent", "high", "normal", "low"]);

export const subtaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
});

export const ticketSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(""),
  acceptanceCriteria: z.array(z.string()).default([]),
  implementationNotes: z.string().default(""),
  priority: ticketPrioritySchema.default("normal"),
  estimateDays: z
    .number()
    .min(0.5)
    .max(20)
    .default(2),
  labels: z.array(z.string()).default([]),
  subtasks: z.array(subtaskSchema).max(8).default([]),
});

export const ticketEpicSchema = z.object({
  name: z.string().min(1),
  summary: z.string().default(""),
  tasks: z.array(ticketSchema).default([]),
});

export const ticketPhaseSchema = z.object({
  name: z.string().min(1),
  goal: z.string().default(""),
  epics: z.array(ticketEpicSchema).default([]),
});

export const ticketTreeSchema = z.object({
  projectName: z.string().min(1),
  summary: z.string().default(""),
  phases: z.array(ticketPhaseSchema).default([]),
  qualityNotes: z.string().default(""),
});

export type Subtask = z.infer<typeof subtaskSchema>;
export type Ticket = z.infer<typeof ticketSchema>;
export type TicketEpic = z.infer<typeof ticketEpicSchema>;
export type TicketPhase = z.infer<typeof ticketPhaseSchema>;
export type TicketTree = z.infer<typeof ticketTreeSchema>;
