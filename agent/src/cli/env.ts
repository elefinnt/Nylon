import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { listRegisteredProviders } from "../providers/registry.js";

/**
 * Maps each provider id to the env var(s) we accept for its API key, in
 * priority order. The first non-empty match wins.
 */
const PROVIDER_KEY_VARS: Record<string, readonly string[]> = {
  cursor: ["CURSOR_API_KEY", "NYLON_CURSOR_KEY"],
  openai: ["OPENAI_API_KEY", "NYLON_OPENAI_KEY"],
  anthropic: ["ANTHROPIC_API_KEY", "NYLON_ANTHROPIC_KEY"],
};

const GITHUB_TOKEN_VARS = ["NYLON_GITHUB_TOKEN", "GITHUB_TOKEN", "GH_TOKEN"];
const CLICKUP_TOKEN_VARS = ["CLICKUP_API_KEY", "NYLON_CLICKUP_TOKEN"];

export interface EnvDiscovery {
  /** Token from env, if any. Includes which env var name supplied it. */
  githubToken?: { value: string; source: string };
  /** Map of provider id to discovered key (with source var name). */
  providerKeys: Map<string, { value: string; source: string }>;
  /** Provider id requested via env, if any. */
  preferredProvider?: { value: string; source: string };
  /** ClickUp personal API token from env, if any. */
  clickupToken?: { value: string; source: string };
  /** Whether a `.env` file in cwd was loaded. */
  dotEnvLoaded: boolean;
  dotEnvPath?: string;
}

/**
 * Load `<cwd>/.env` (or a custom path) into `process.env` if present, then
 * scan for known credentials. Safe to call once at CLI startup.
 */
export function discoverFromEnvironment(opts: { dotEnvPath?: string } = {}): EnvDiscovery {
  const dotEnv = loadDotEnvIfPresent(opts.dotEnvPath);

  const githubToken = pickFirst(GITHUB_TOKEN_VARS);

  const providerKeys = new Map<string, { value: string; source: string }>();
  for (const provider of listRegisteredProviders()) {
    const vars = PROVIDER_KEY_VARS[provider.id] ?? [];
    const found = pickFirst(vars);
    if (found) providerKeys.set(provider.id, found);
  }

  const preferredProvider = pickFirst(["NYLON_PROVIDER"]);
  const clickupToken = pickFirst(CLICKUP_TOKEN_VARS);

  const result: EnvDiscovery = {
    providerKeys,
    dotEnvLoaded: dotEnv.loaded,
  };
  if (githubToken) result.githubToken = githubToken;
  if (preferredProvider) result.preferredProvider = preferredProvider;
  if (clickupToken) result.clickupToken = clickupToken;
  if (dotEnv.path) result.dotEnvPath = dotEnv.path;
  return result;
}

function loadDotEnvIfPresent(customPath?: string): { loaded: boolean; path?: string } {
  const target = resolve(customPath ?? `${process.cwd()}/.env`);
  if (!existsSync(target)) return { loaded: false };
  // process.loadEnvFile() is built into Node 20.6+. Existing process.env
  // entries take precedence (this matches dotenv's default behaviour).
  type ProcessWithLoadEnvFile = NodeJS.Process & {
    loadEnvFile?: (path?: string) => void;
  };
  const p = process as ProcessWithLoadEnvFile;
  if (typeof p.loadEnvFile !== "function") return { loaded: false };
  try {
    p.loadEnvFile(target);
    return { loaded: true, path: target };
  } catch {
    return { loaded: false };
  }
}

function pickFirst(names: readonly string[]): { value: string; source: string } | undefined {
  for (const name of names) {
    const raw = process.env[name];
    if (raw && raw.trim().length > 0) {
      return { value: raw.trim(), source: name };
    }
  }
  return undefined;
}

export function listProviderKeyVars(providerId: string): readonly string[] {
  return PROVIDER_KEY_VARS[providerId] ?? [];
}

export function listGithubTokenVars(): readonly string[] {
  return GITHUB_TOKEN_VARS;
}

export function listClickUpTokenVars(): readonly string[] {
  return CLICKUP_TOKEN_VARS;
}
