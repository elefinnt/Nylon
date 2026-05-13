import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { discoverFromEnvironment } from "../src/cli/env.js";

const KEYS_TO_CLEAR = [
  "GITHUB_TOKEN",
  "GH_TOKEN",
  "PR_AGENT_GITHUB_TOKEN",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "CURSOR_API_KEY",
  "PR_AGENT_OPENAI_KEY",
  "PR_AGENT_ANTHROPIC_KEY",
  "PR_AGENT_CURSOR_KEY",
  "PR_AGENT_PROVIDER",
];

function withCleanEnv<T>(fn: () => T): T {
  const snapshot: Record<string, string | undefined> = {};
  for (const key of KEYS_TO_CLEAR) {
    snapshot[key] = process.env[key];
    delete process.env[key];
  }
  try {
    return fn();
  } finally {
    for (const key of KEYS_TO_CLEAR) {
      const prev = snapshot[key];
      if (prev === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = prev;
      }
    }
  }
}

test("discoverFromEnvironment finds GITHUB_TOKEN", () => {
  withCleanEnv(() => {
    process.env["GITHUB_TOKEN"] = "ghp_test123";
    const env = discoverFromEnvironment({ dotEnvPath: "/nonexistent/.env" });
    assert.deepEqual(env.githubToken, { value: "ghp_test123", source: "GITHUB_TOKEN" });
    assert.equal(env.dotEnvLoaded, false);
    assert.equal(env.providerKeys.size, 0);
  });
});

test("PR_AGENT_GITHUB_TOKEN beats GITHUB_TOKEN", () => {
  withCleanEnv(() => {
    process.env["GITHUB_TOKEN"] = "fallback";
    process.env["PR_AGENT_GITHUB_TOKEN"] = "preferred";
    const env = discoverFromEnvironment({ dotEnvPath: "/nonexistent/.env" });
    assert.equal(env.githubToken?.value, "preferred");
    assert.equal(env.githubToken?.source, "PR_AGENT_GITHUB_TOKEN");
  });
});

test("OPENAI_API_KEY is mapped to the openai provider", () => {
  withCleanEnv(() => {
    process.env["OPENAI_API_KEY"] = "sk-openai";
    const env = discoverFromEnvironment({ dotEnvPath: "/nonexistent/.env" });
    assert.equal(env.providerKeys.size, 1);
    assert.equal(env.providerKeys.get("openai")?.value, "sk-openai");
  });
});

test("multiple provider keys are all discovered", () => {
  withCleanEnv(() => {
    process.env["OPENAI_API_KEY"] = "sk-openai";
    process.env["ANTHROPIC_API_KEY"] = "sk-ant";
    process.env["CURSOR_API_KEY"] = "cursor_x";
    const env = discoverFromEnvironment({ dotEnvPath: "/nonexistent/.env" });
    assert.equal(env.providerKeys.size, 3);
    assert.equal(env.providerKeys.get("openai")?.value, "sk-openai");
    assert.equal(env.providerKeys.get("anthropic")?.value, "sk-ant");
    assert.equal(env.providerKeys.get("cursor")?.value, "cursor_x");
  });
});

test("PR_AGENT_PROVIDER is captured", () => {
  withCleanEnv(() => {
    process.env["PR_AGENT_PROVIDER"] = "anthropic";
    const env = discoverFromEnvironment({ dotEnvPath: "/nonexistent/.env" });
    assert.equal(env.preferredProvider?.value, "anthropic");
  });
});

test("blank/whitespace env values are ignored", () => {
  withCleanEnv(() => {
    process.env["GITHUB_TOKEN"] = "   ";
    process.env["OPENAI_API_KEY"] = "";
    const env = discoverFromEnvironment({ dotEnvPath: "/nonexistent/.env" });
    assert.equal(env.githubToken, undefined);
    assert.equal(env.providerKeys.size, 0);
  });
});

test(".env file in cwd is loaded", () => {
  withCleanEnv(() => {
    const dir = mkdtempSync(join(tmpdir(), "pr-agent-env-"));
    try {
      const dotEnv = join(dir, ".env");
      writeFileSync(dotEnv, "GITHUB_TOKEN=from-dotenv\nOPENAI_API_KEY=sk-from-dotenv\n", "utf8");
      const env = discoverFromEnvironment({ dotEnvPath: dotEnv });
      assert.equal(env.dotEnvLoaded, true);
      assert.equal(env.dotEnvPath, dotEnv);
      assert.equal(env.githubToken?.value, "from-dotenv");
      assert.equal(env.providerKeys.get("openai")?.value, "sk-from-dotenv");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

test("existing env vars take precedence over .env values", () => {
  withCleanEnv(() => {
    process.env["GITHUB_TOKEN"] = "from-shell";
    const dir = mkdtempSync(join(tmpdir(), "pr-agent-env-"));
    try {
      const dotEnv = join(dir, ".env");
      writeFileSync(dotEnv, "GITHUB_TOKEN=from-dotenv\n", "utf8");
      const env = discoverFromEnvironment({ dotEnvPath: dotEnv });
      assert.equal(env.githubToken?.value, "from-shell");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
