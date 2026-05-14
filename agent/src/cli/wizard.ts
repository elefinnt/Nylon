import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { stdout } from "node:process";

import { defaultConfigPath } from "../config.js";
import { listRegisteredProviders, getProvider } from "../providers/registry.js";
import { AgentError } from "../util/errors.js";
import type { EnvDiscovery } from "./env.js";
import { listGithubTokenVars, listProviderKeyVars, listClickUpTokenVars } from "./env.js";
import type { Prompter } from "./prompts.js";
import { paint } from "./render.js";

export interface WizardResult {
  path: string;
  providerId: string;
  modelId: string;
}

export interface WizardOptions {
  path?: string;
  /** Pre-discovered env vars; values seen here are used without prompting. */
  env?: EnvDiscovery;
  /**
   * If true, every value MUST come from env. We never prompt; if anything
   * is missing we throw with a clear AgentError.
   */
  fromEnvOnly?: boolean;
}

interface ProviderChoice {
  id: string;
  label: string;
  hint?: string;
  signupUrl: string;
  keyPlaceholder: string;
}

const PROVIDER_BLURB: Record<string, Omit<ProviderChoice, "id" | "label">> = {
  cursor: {
    hint: "uses your Pro / Pro+ plan, no separate AI bill",
    signupUrl: "https://cursor.com/dashboard/integrations",
    keyPlaceholder: "Paste your Cursor API key (starts with `cursor_`)",
  },
  openai: {
    hint: "billing must be enabled on the OpenAI account",
    signupUrl: "https://platform.openai.com/api-keys",
    keyPlaceholder: "Paste your OpenAI API key (starts with `sk-`)",
  },
  anthropic: {
    hint: "anthropic.com console key",
    signupUrl: "https://console.anthropic.com/settings/keys",
    keyPlaceholder: "Paste your Anthropic API key (starts with `sk-ant-`)",
  },
};

/**
 * Walk the user through entering their GitHub PAT and one provider's API
 * key, then write a fresh config.toml. Always overwrites.
 *
 * Any value that is already in the environment (GITHUB_TOKEN, OPENAI_API_KEY,
 * etc.) is used silently and the matching prompt is skipped.
 */
export async function runInitWizard(
  prompter: Prompter,
  opts: WizardOptions = {},
): Promise<WizardResult> {
  const target = opts.path ?? defaultConfigPath();
  const env = opts.env;
  const fromEnvOnly = opts.fromEnvOnly === true;

  stdout.write(`${paint.bold("nylon setup")}\n`);
  stdout.write(paint.dim(`We'll write your config to ${target}.\n`));
  if (env?.dotEnvLoaded) {
    stdout.write(paint.dim(`Loaded ${env.dotEnvPath}\n`));
  }
  stdout.write(paint.dim("Tip: set GITHUB_TOKEN / OPENAI_API_KEY / etc. (or a .env in cwd) to skip prompts.\n\n"));

  const githubToken = await resolveGithubToken({ prompter, env, fromEnvOnly });

  const providerId = await resolveProviderId({ prompter, env, fromEnvOnly });
  const provider = buildProviderChoices().find((p) => p.id === providerId);
  if (!provider) {
    throw new AgentError("UNKNOWN_PROVIDER", `Unknown provider: ${providerId}`);
  }

  const apiKey = await resolveApiKey({ prompter, env, fromEnvOnly, provider });

  const modelId = await resolveModelId({ prompter, providerId, fromEnvOnly });

  const clickupToken = await resolveClickUpToken({ prompter, env, fromEnvOnly });

  const toml = renderConfigToml({ githubToken, providerId, apiKey, modelId, clickupToken });
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, toml, { encoding: "utf8" });
  try {
    chmodSync(target, 0o600);
  } catch {
    // Best-effort on Windows where chmod is a no-op.
  }

  return { path: target, providerId, modelId };
}

async function resolveGithubToken(args: {
  prompter: Prompter;
  env?: EnvDiscovery;
  fromEnvOnly: boolean;
}): Promise<string> {
  const { prompter, env, fromEnvOnly } = args;
  if (env?.githubToken) {
    stdout.write(
      `${paint.bold("1. GitHub")}  ${paint.green(`✓ using ${env.githubToken.source}`)}\n\n`,
    );
    return env.githubToken.value;
  }
  if (fromEnvOnly) {
    throw new AgentError(
      "ENV_MISSING_GITHUB_TOKEN",
      `--from-env: no GitHub token in env. Set one of: ${listGithubTokenVars().join(", ")}.`,
    );
  }
  stdout.write(`${paint.bold("1. GitHub")}\n`);
  stdout.write(
    paint.dim(
      "  Create a Personal Access Token (classic) with the `repo` scope at\n" +
        "  https://github.com/settings/tokens, then paste it below.\n",
    ),
  );
  return prompter.secret("  GitHub token");
}

async function resolveProviderId(args: {
  prompter: Prompter;
  env?: EnvDiscovery;
  fromEnvOnly: boolean;
}): Promise<string> {
  const { prompter, env, fromEnvOnly } = args;

  if (env?.preferredProvider) {
    const id = env.preferredProvider.value;
    stdout.write(
      `${paint.bold("2. AI provider")}  ${paint.green(`✓ ${id} (from ${env.preferredProvider.source})`)}\n\n`,
    );
    return id;
  }

  // If the user has an *_API_KEY for exactly one provider in env, use it
  // automatically (matches what most users expect when they `export
  // OPENAI_API_KEY=...`).
  if (env && env.providerKeys.size === 1) {
    const entry = [...env.providerKeys.entries()][0];
    if (entry) {
      const [id, src] = entry;
      stdout.write(
        `${paint.bold("2. AI provider")}  ${paint.green(`✓ ${id} (from ${src.source})`)}\n\n`,
      );
      return id;
    }
  }

  if (fromEnvOnly) {
    if (env && env.providerKeys.size > 1) {
      throw new AgentError(
        "ENV_AMBIGUOUS_PROVIDER",
        `--from-env: multiple provider keys present (${[...env.providerKeys.keys()].join(", ")}). Set NYLON_PROVIDER to disambiguate.`,
      );
    }
    throw new AgentError(
      "ENV_NO_PROVIDER",
      "--from-env: no provider API key in env. Set one of CURSOR_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY.",
    );
  }

  stdout.write(`${paint.bold("2. AI provider")}\n`);
  const providers = buildProviderChoices();
  return prompter.choice(
    "  Which provider should review PRs?",
    providers.map((p) => ({ id: p.id, label: p.label, hint: p.hint })),
    { defaultId: providers[0]?.id ?? "cursor" },
  );
}

async function resolveApiKey(args: {
  prompter: Prompter;
  env?: EnvDiscovery;
  fromEnvOnly: boolean;
  provider: ProviderChoice;
}): Promise<string> {
  const { prompter, env, fromEnvOnly, provider } = args;
  const fromEnv = env?.providerKeys.get(provider.id);
  if (fromEnv) {
    stdout.write(
      `${paint.bold(`3. ${provider.label} API key`)}  ${paint.green(`✓ using ${fromEnv.source}`)}\n\n`,
    );
    return fromEnv.value;
  }
  if (fromEnvOnly) {
    const vars = listProviderKeyVars(provider.id);
    throw new AgentError(
      "ENV_MISSING_API_KEY",
      `--from-env: no API key for ${provider.id} in env. Set one of: ${vars.join(", ") || "<none configured>"}.`,
    );
  }
  stdout.write(`${paint.bold(`3. ${provider.label} API key`)}\n`);
  stdout.write(paint.dim(`  Get one at ${provider.signupUrl}\n`));
  return prompter.secret(`  ${provider.keyPlaceholder}`);
}

async function resolveModelId(args: {
  prompter: Prompter;
  providerId: string;
  fromEnvOnly: boolean;
}): Promise<string> {
  const { prompter, providerId, fromEnvOnly } = args;
  const reg = getProvider(providerId);
  const choices = reg.models.map((m) => ({ id: m.id, label: m.displayName }));
  const defaultModelId = choices[0]?.id ?? "";

  if (fromEnvOnly || choices.length <= 1) {
    return defaultModelId;
  }

  stdout.write(`${paint.bold("4. Default model")}\n`);
  return prompter.choice(
    "  Pick a default model (you can override per-run with --model):",
    choices,
    defaultModelId ? { defaultId: defaultModelId } : {},
  );
}

async function resolveClickUpToken(args: {
  prompter: Prompter;
  env?: EnvDiscovery;
  fromEnvOnly: boolean;
}): Promise<string | undefined> {
  const { prompter, env, fromEnvOnly } = args;

  if (env?.clickupToken) {
    stdout.write(
      `${paint.bold("5. ClickUp")}  ${paint.green(`✓ using ${env.clickupToken.source}`)}\n\n`,
    );
    return env.clickupToken.value;
  }

  // In --from-env mode we silently skip ClickUp if not present (it's optional).
  if (fromEnvOnly) return undefined;

  stdout.write(`${paint.bold("5. ClickUp")}  ${paint.dim("(optional — skip to set up later)")}\n`);
  stdout.write(
    paint.dim(
      "  Mint a Personal API Token at ClickUp → Settings → Apps.\n" +
        "  Token starts with `pk_`. Leave blank to skip.\n",
    ),
  );

  const raw = (await prompter.text("  ClickUp token", { required: false })).trim();
  if (raw.length === 0) {
    stdout.write(paint.dim("  Skipped — add [integrations.clickup] to your config later.\n\n"));
    return undefined;
  }
  return raw;
}

function buildProviderChoices(): ProviderChoice[] {
  return listRegisteredProviders().map((p) => {
    const blurb = PROVIDER_BLURB[p.id];
    return {
      id: p.id,
      label: p.displayName,
      ...(blurb ?? {
        hint: undefined,
        signupUrl: "",
        keyPlaceholder: `Paste your ${p.displayName} API key`,
      }),
    } as ProviderChoice;
  });
}

function renderConfigToml(args: {
  githubToken: string;
  providerId: string;
  apiKey: string;
  modelId: string;
  clickupToken?: string;
}): string {
  const { githubToken, providerId, apiKey, modelId, clickupToken } = args;

  const header = [
    "# nylon config",
    "# Generated by `nylon init`. Rerun init to overwrite.",
  ];
  const github = ["[github]", `token = ${tomlString(githubToken)}`];
  const provider = [
    `[providers.${providerId}]`,
    `api_key = ${tomlString(apiKey)}`,
    ...(modelId ? [`default_model = ${tomlString(modelId)}`] : []),
  ];
  const defaults = [
    "[defaults]",
    `provider = ${tomlString(providerId)}`,
    ...(modelId ? [`model = ${tomlString(modelId)}`] : []),
    "post_review = true",
  ];

  const sections = [header, github, provider, defaults];

  if (clickupToken) {
    sections.push([
      "[integrations.clickup]",
      `token = ${tomlString(clickupToken)}`,
      "# default_list_id = \"\"  # optional: skip the list picker every run",
    ]);
  }

  return sections.map((s) => s.join("\n")).join("\n\n") + "\n";
}

function tomlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
