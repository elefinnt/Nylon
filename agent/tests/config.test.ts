import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadConfig, writeTemplateConfig } from "../src/config.js";
import { AgentError } from "../src/util/errors.js";

async function inTempDir<T>(fn: (dir: string) => T | Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "nylon-cfg-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("writeTemplateConfig creates a placeholder file", async () => {
  await inTempDir(async (dir) => {
    const target = join(dir, "config.toml");
    const path = await writeTemplateConfig(target);
    assert.equal(path, target);
    assert.throws(() => loadConfig(target), (err: unknown) => {
      assert.ok(err instanceof AgentError);
      assert.equal((err as AgentError).code, "CONFIG_PLACEHOLDER");
      return true;
    });
  });
});

test("loadConfig accepts a filled-in file", async () => {
  await inTempDir((dir) => {
    const target = join(dir, "config.toml");
    writeFileSync(
      target,
      `
[github]
token = "ghp_realtokenvalue"

[providers.anthropic]
api_key = "sk-ant-real"
default_model = "claude-opus-4-7"
`,
      "utf8",
    );
    const cfg = loadConfig(target);
    assert.equal(cfg.github.token, "ghp_realtokenvalue");
    assert.equal(cfg.providers["anthropic"]?.api_key, "sk-ant-real");
    assert.equal(cfg.defaults.post_review, true);
  });
});

test("missing token gives a clear error", async () => {
  await inTempDir((dir) => {
    const target = join(dir, "config.toml");
    writeFileSync(target, "[providers.anthropic]\napi_key = \"x\"\n", "utf8");
    assert.throws(() => loadConfig(target), (err: unknown) => {
      assert.ok(err instanceof AgentError);
      assert.equal((err as AgentError).code, "CONFIG_INVALID");
      return true;
    });
  });
});

test("missing file points the user at `nylon init`", async () => {
  await inTempDir((dir) => {
    const target = join(dir, "nope.toml");
    assert.throws(() => loadConfig(target), (err: unknown) => {
      assert.ok(err instanceof AgentError);
      assert.equal((err as AgentError).code, "CONFIG_MISSING");
      assert.match((err as AgentError).message, /nylon init/);
      return true;
    });
  });
});
