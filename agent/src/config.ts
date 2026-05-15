import { existsSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parse as parseToml } from "smol-toml";
import { z } from "zod";

import { AgentError } from "./util/errors.js";

const providerEntrySchema = z.object({
  api_key: z.string().min(1).optional(),
  default_model: z.string().min(1).optional(),
  base_url: z.string().url().optional(),
});

const defaultsSchema = z.object({
  provider: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  post_review: z.boolean().default(true),
});

const reviewSchema = z.object({
  skills: z.array(z.string()).default([]),
  request_changes_on_issue: z.boolean().default(false),
  labels: z.boolean().default(false),
});

// The SOW → ClickUp pipeline always runs a fixed five-agent sequence
// (intelligence → architect → planner → ticket-generator → quality), so
// `extract.skills` is no longer user-configurable. We still accept and
// ignore the field for backward compatibility with older configs.
const extractSchema = z.object({
  skills: z.array(z.string()).optional(),
  include: z.array(z.string()).default(["md", "pdf", "docx", "txt"]),
  pdf_strategy: z.enum(["auto", "text", "vision"]).default("auto"),
  max_chars_per_doc: z.number().int().positive().default(80_000),
});

const clickupSchema = z.object({
  token: z.string().min(1),
  default_list_id: z.string().optional(),
});

const integrationsSchema = z.object({
  clickup: clickupSchema.optional(),
});

const githubSchema = z.object({
  token: z.string().min(1),
});

export const configSchema = z.object({
  github: githubSchema,
  providers: z.record(providerEntrySchema).default({}),
  defaults: defaultsSchema.default({ post_review: true }),
  review: reviewSchema.default({ skills: [] }),
  extract: extractSchema.default({}),
  integrations: integrationsSchema.default({}),
});

export type ProviderEntry = z.infer<typeof providerEntrySchema>;
export type Defaults = z.infer<typeof defaultsSchema>;
export type ExtractConfig = z.infer<typeof extractSchema>;
export type ClickUpConfig = z.infer<typeof clickupSchema>;
export type Config = z.infer<typeof configSchema> & { sourcePath: string };

export function defaultConfigPath(): string {
  return join(homedir(), ".nylon", "config.toml");
}

export function loadConfig(path: string = defaultConfigPath()): Config {
  if (!existsSync(path)) {
    throw new AgentError(
      "CONFIG_MISSING",
      `Config file not found at ${path}. Run \`nylon init\` to create it.`,
    );
  }
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e: unknown) {
    throw new AgentError("CONFIG_READ", `Could not read ${path}: ${(e as Error).message}`);
  }

  let table: unknown;
  try {
    table = parseToml(raw);
  } catch (e: unknown) {
    throw new AgentError("CONFIG_PARSE", `Could not parse ${path}: ${(e as Error).message}`);
  }

  const parsed = configSchema.safeParse(table);
  if (!parsed.success) {
    throw new AgentError(
      "CONFIG_INVALID",
      `Config at ${path} is invalid:\n  ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("\n  ")}`,
    );
  }

  if (parsed.data.github.token.includes("replace_me")) {
    throw new AgentError(
      "CONFIG_PLACEHOLDER",
      `github.token in ${path} is still the placeholder. Generate a PAT at https://github.com/settings/tokens.`,
    );
  }

  return { ...parsed.data, sourcePath: path };
}

const TEMPLATE = `[github]
# Personal Access Token. Required scopes:
#   - repo (read access for private repos; public_repo if you only review public PRs)
#   - pull_request:write (to post the review back to the PR)
token = "ghp_replace_me"

# Cursor uses your Pro / Pro+ plan. Mint a personal API key at:
#   https://cursor.com/dashboard/integrations
# Monitor SDK spend at:
#   https://cursor.com/dashboard/usage
[providers.cursor]
api_key = "cursor_replace_me"
default_model = "composer-2"

[providers.anthropic]
api_key = "sk-ant-replace_me"
default_model = "claude-opus-4-7"

[providers.openai]
api_key = "sk-replace_me"
default_model = "gpt-5"

[defaults]
# Set both to skip the interactive picker.
# provider = "cursor"
# model = "composer-2"
post_review = true

[review]
# Enable skills to improve review quality. Available: intent-analysis, inline-reviewer, review-synthesis
# Activating all three enables the full 3-pass pipeline on the Cursor provider.
# skills = ["intent-analysis", "inline-reviewer", "review-synthesis"]

# Use REQUEST_CHANGES (blocks merge) instead of COMMENT when issues are found.
# request_changes_on_issue = false

# Auto-apply GitHub labels (high-risk, needs-fixes, follow-up-needed) to the PR.
# Labels must already exist on the repository.
# labels = false

# ── Task exporter ───────────────────────────────────────────────────────────

# ClickUp personal API token. Mint one at: ClickUp → Settings → Apps.
# Token starts with pk_
# [integrations.clickup]
# token = "pk_replace_me"
# default_list_id = ""   # optional: skip the list picker every run

[extract]
# Task extraction runs a fixed five-agent pipeline:
#   1. SOW Intelligence Extractor   — reads & classifies the document
#   2. Solution Architect           — groups requirements into modules
#   3. Delivery Planner             — organises into phases & epics
#   4. Ticket Generator             — writes ClickUp-ready parent tasks + subtasks
#   5. Quality & Deduplication      — merges duplicates, caps at 15–40 parents
#
# The pipeline is intentionally not user-configurable: every stage
# depends on the previous one's structured output.

# File types the reader will process.
include = ["md", "pdf", "docx", "txt"]

# PDF reading strategy: "auto" tries text first and warns if the page is image-only.
# Set to "text" to always use text extraction only.
pdf_strategy = "auto"
`;

export async function writeTemplateConfig(path?: string): Promise<string> {
  const target = resolve(path ?? defaultConfigPath());
  if (existsSync(target)) {
    return target;
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, TEMPLATE, { encoding: "utf8" });
  try {
    chmodSync(target, 0o600);
  } catch {
    // Best-effort on Windows where chmod semantics are limited; the installer
    // tightens ACLs via icacls separately.
  }
  return target;
}
