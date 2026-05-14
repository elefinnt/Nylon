import test from "node:test";
import assert from "node:assert/strict";

import { parseArgv } from "../src/cli/argv.js";

test("no argv falls through to IPC mode", () => {
  const out = parseArgv([]);
  assert.equal(out.kind, "ipc");
});

test("--help renders root help", () => {
  const out = parseArgv(["--help"]);
  assert.equal(out.kind, "command");
  if (out.kind !== "command") return;
  assert.deepEqual(out.command, { kind: "help", topic: undefined });
});

test("help <topic> selects the topic", () => {
  const out = parseArgv(["help", "review"]);
  assert.equal(out.kind, "command");
  if (out.kind !== "command") return;
  assert.deepEqual(out.command, { kind: "help", topic: "review" });
});

test("--version maps to version command", () => {
  const out = parseArgv(["-V"]);
  assert.equal(out.kind, "command");
  if (out.kind !== "command") return;
  assert.deepEqual(out.command, { kind: "version" });
});

test("init --force is parsed", () => {
  const out = parseArgv(["init", "--force"]);
  assert.equal(out.kind, "command");
  if (out.kind !== "command") return;
  assert.deepEqual(out.command, { kind: "init", force: true, fromEnv: false });
});

test("init --from-env is parsed", () => {
  const out = parseArgv(["init", "--from-env"]);
  assert.equal(out.kind, "command");
  if (out.kind !== "command") return;
  assert.deepEqual(out.command, { kind: "init", force: false, fromEnv: true });
});

test("init combines --force and --from-env", () => {
  const out = parseArgv(["init", "--force", "--from-env"]);
  assert.equal(out.kind, "command");
  if (out.kind !== "command") return;
  assert.deepEqual(out.command, { kind: "init", force: true, fromEnv: true });
});

test("init rejects unknown options", () => {
  const out = parseArgv(["init", "--lol"]);
  assert.equal(out.kind, "error");
});

test("providers takes no arguments", () => {
  const out = parseArgv(["providers"]);
  assert.equal(out.kind, "command");
  if (out.kind !== "command") return;
  assert.deepEqual(out.command, { kind: "providers" });
});

test("menu maps to the menu command", () => {
  const out = parseArgv(["menu"]);
  assert.equal(out.kind, "command");
  if (out.kind !== "command") return;
  assert.deepEqual(out.command, { kind: "menu" });
});

test("menu --help routes to its help topic", () => {
  const out = parseArgv(["menu", "--help"]);
  assert.equal(out.kind, "command");
  if (out.kind !== "command") return;
  assert.deepEqual(out.command, { kind: "help", topic: "menu" });
});

test("menu rejects unexpected arguments", () => {
  const out = parseArgv(["menu", "extra"]);
  assert.equal(out.kind, "error");
});

test("review parses url + dry + provider/model overrides", () => {
  const out = parseArgv([
    "review",
    "https://github.com/a/b/pull/1",
    "--dry",
    "-p",
    "openai",
    "-m",
    "gpt-5",
    "--verbose",
  ]);
  assert.equal(out.kind, "command");
  if (out.kind !== "command" || out.command.kind !== "review") return;
  assert.equal(out.command.url, "https://github.com/a/b/pull/1");
  assert.equal(out.command.dry, true);
  assert.equal(out.command.provider, "openai");
  assert.equal(out.command.model, "gpt-5");
  assert.equal(out.command.verbose, true);
});

test("bare URL is shorthand for `review <url>`", () => {
  const out = parseArgv(["https://github.com/a/b/pull/2"]);
  assert.equal(out.kind, "command");
  if (out.kind !== "command" || out.command.kind !== "review") return;
  assert.equal(out.command.url, "https://github.com/a/b/pull/2");
  assert.equal(out.command.dry, false);
  assert.equal(out.command.provider, undefined);
  assert.equal(out.command.model, undefined);
});

test("--provider=value style works", () => {
  const out = parseArgv(["https://github.com/a/b/pull/3", "--provider=anthropic"]);
  assert.equal(out.kind, "command");
  if (out.kind !== "command" || out.command.kind !== "review") return;
  assert.equal(out.command.provider, "anthropic");
});

test("missing url after `review` is an error", () => {
  const out = parseArgv(["review"]);
  assert.equal(out.kind, "error");
});

test("non-URL positional is rejected with a friendly message", () => {
  const out = parseArgv(["review", "totally-not-a-url"]);
  assert.equal(out.kind, "error");
  if (out.kind !== "error") return;
  assert.match(out.message, /does not look like a GitHub pull request URL/);
});

test("unknown top-level command surfaces an error", () => {
  const out = parseArgv(["whatever"]);
  assert.equal(out.kind, "error");
});

test("unknown flag inside review is rejected", () => {
  const out = parseArgv(["https://github.com/a/b/pull/1", "--what"]);
  assert.equal(out.kind, "error");
});
