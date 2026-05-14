import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  listSkills,
  getSkill,
  resolveSkills,
  filterValidSkillIds,
  hasPipelineSkills,
} from "../src/skills/registry.js";
import { CATALOGUE } from "../src/skills/catalogue.js";
import { loadSystemPrompt } from "../src/providers/prompts/user.js";
import {
  buildIntentPrompt,
  buildInlineReviewPrompt,
  buildSynthesisPrompt,
  extractInlineReview,
  extractSynthesis,
} from "../src/providers/prompts/pipeline.js";
import { loadConfig } from "../src/config.js";
import type { PullRequestSnapshot } from "../src/providers/types.js";

// ── registry ──────────────────────────────────────────────────────

test("catalogue has all three pipeline skills", () => {
  const ids = CATALOGUE.map(s => s.id);
  assert.ok(ids.includes("intent-analysis"));
  assert.ok(ids.includes("inline-reviewer"));
  assert.ok(ids.includes("review-synthesis"));
});

test("listSkills with no stage returns all skills", () => {
  assert.equal(listSkills().length, CATALOGUE.length);
});

test("listSkills filters by stage", () => {
  const reviewSkills = listSkills("review");
  assert.ok(reviewSkills.length > 0);
  assert.ok(reviewSkills.every(s => s.stage.includes("review")));
});

test("getSkill returns correct skill", () => {
  const s = getSkill("intent-analysis");
  assert.equal(s.id, "intent-analysis");
  assert.equal(s.pipelineStage, "intent");
});

test("getSkill throws on unknown id", () => {
  assert.throws(() => getSkill("does-not-exist"), /Unknown skill/);
});

test("filterValidSkillIds drops unknown ids silently", () => {
  const result = filterValidSkillIds(["intent-analysis", "ghost-skill", "inline-reviewer"]);
  assert.deepEqual(result, ["intent-analysis", "inline-reviewer"]);
});

test("hasPipelineSkills returns true when all three are present", () => {
  const all = resolveSkills(["intent-analysis", "inline-reviewer", "review-synthesis"]);
  assert.equal(hasPipelineSkills(all), true);
});

test("hasPipelineSkills returns false when only two are present", () => {
  const two = resolveSkills(["intent-analysis", "inline-reviewer"]);
  assert.equal(hasPipelineSkills(two), false);
});

test("hasPipelineSkills returns false with empty skills", () => {
  assert.equal(hasPipelineSkills([]), false);
});

// ── prompt assembly ───────────────────────────────────────────────

test("loadSystemPrompt with no skills returns base prompt", () => {
  const base = loadSystemPrompt([]);
  const withUndefined = loadSystemPrompt();
  assert.equal(base, withUndefined);
  assert.ok(base.includes("senior software engineer"));
});

test("loadSystemPrompt with pipeline skills does not append blocks", () => {
  const pipelineSkills = resolveSkills(["intent-analysis", "inline-reviewer", "review-synthesis"]);
  const prompt = loadSystemPrompt(pipelineSkills);
  // Pipeline skills inject their own prompts per-pass, not into the base prompt
  assert.equal(prompt, loadSystemPrompt([]));
});

// ── pipeline prompt builders ──────────────────────────────────────

const mockPr: PullRequestSnapshot = {
  owner: "acme", repo: "widget", number: 42,
  title: "Add dark mode",
  body: "Adds dark mode support",
  baseSha: "abc", headSha: "def",
  files: [{ filename: "src/theme.ts", status: "modified", additions: 20, deletions: 5 }],
  unifiedDiff: "diff --git a/src/theme.ts...",
};

test("buildIntentPrompt includes PR metadata but not diff", () => {
  const prompt = buildIntentPrompt(mockPr);
  assert.ok(prompt.includes("Add dark mode"));
  assert.ok(prompt.includes("src/theme.ts"));
  assert.ok(!prompt.includes("diff --git"));
});

test("buildInlineReviewPrompt includes intent and diff", () => {
  const prompt = buildInlineReviewPrompt(mockPr, "This PR adds dark mode.");
  assert.ok(prompt.includes("This PR adds dark mode."));
  assert.ok(prompt.includes("diff --git"));
});

test("buildSynthesisPrompt includes intent and comments", () => {
  const prompt = buildSynthesisPrompt("This PR adds dark mode.", []);
  assert.ok(prompt.includes("This PR adds dark mode."));
  assert.ok(prompt.includes("[]"));
});

// ── pipeline JSON extractors ──────────────────────────────────────

test("extractInlineReview handles valid JSON", () => {
  const raw = `{ "comments": [{ "path": "src/theme.ts", "line": 10, "side": "RIGHT", "body": "Nice", "severity": "info" }] }`;
  const result = extractInlineReview(raw);
  assert.equal(result.comments.length, 1);
  assert.equal(result.comments[0]?.path, "src/theme.ts");
});

test("extractInlineReview returns empty comments for empty array", () => {
  const result = extractInlineReview(`{ "comments": [] }`);
  assert.equal(result.comments.length, 0);
});

test("extractInlineReview throws on missing JSON", () => {
  assert.throws(() => extractInlineReview("no json here"), /No JSON object/);
});

test("extractSynthesis handles valid JSON", () => {
  const raw = `{ "summary": "Looks good.", "riskLevel": "low", "followUps": [] }`;
  const result = extractSynthesis(raw);
  assert.equal(result.summary, "Looks good.");
  assert.equal(result.riskLevel, "low");
});

test("extractSynthesis throws on missing JSON", () => {
  assert.throws(() => extractSynthesis("plain text"), /No JSON object/);
});

// ── config integration ────────────────────────────────────────────

test("config loads review.skills from toml", () => {
  const dir = mkdtempSync(join(tmpdir(), "nylon-skills-cfg-"));
  try {
    const target = join(dir, "config.toml");
    writeFileSync(target, `
[github]
token = "ghp_realtokenvalue"

[review]
skills = ["intent-analysis", "inline-reviewer"]
`, "utf8");
    const cfg = loadConfig(target);
    assert.deepEqual(cfg.review.skills, ["intent-analysis", "inline-reviewer"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("config defaults to empty skills when review section is absent", () => {
  const dir = mkdtempSync(join(tmpdir(), "nylon-skills-cfg-"));
  try {
    const target = join(dir, "config.toml");
    writeFileSync(target, `
[github]
token = "ghp_realtokenvalue"
`, "utf8");
    const cfg = loadConfig(target);
    assert.deepEqual(cfg.review.skills, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});