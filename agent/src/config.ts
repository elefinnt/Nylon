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

const githubSchema = z.object({
  token: z.string().min(1),
});

export const configSchema = z.object({
  github: githubSchema,
  providers: z.record(providerEntrySchema).default({}),
  defaults: defaultsSchema.default({ post_review: true }),
});

export type ProviderEntry = z.infer<typeof providerEntrySchema>;
export type Defaults = z.infer<typeof defaultsSchema>;
export type Config = z.infer<typeof configSchema> & { sourcePath: string };

export function defaultConfigPath(): string {
  return join(homedir(), ".pr-agent", "config.toml");
}

export function loadConfig(path: string = defaultConfigPath()): Config {
  if (!existsSync(path)) {
    throw new AgentError(
      "CONFIG_MISSING",
      `Config file not found at ${path}. Run \`pr-review init\` to create it.`,
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
default_model = "claude-opus-4.5"

[providers.openai]
api_key = "sk-replace_me"
default_model = "gpt-5"

[defaults]
# Set both to skip the interactive picker.
# provider = "cursor"
# model = "composer-2"
post_review = true
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
