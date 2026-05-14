import test from "node:test";
import assert from "node:assert/strict";

import { cleanPathString } from "../src/util/paths.js";

test("returns plain paths untouched", () => {
  assert.equal(
    cleanPathString("C:\\Users\\hacks\\OneDrive\\Documents\\SOW - Squash.docx"),
    "C:\\Users\\hacks\\OneDrive\\Documents\\SOW - Squash.docx",
  );
});

test("strips surrounding double quotes (Right-click → Copy as path)", () => {
  assert.equal(
    cleanPathString('"C:\\Users\\hacks\\OneDrive\\Documents\\SOW - Squash.docx"'),
    "C:\\Users\\hacks\\OneDrive\\Documents\\SOW - Squash.docx",
  );
});

test("strips surrounding single quotes (Powershell drag-drop)", () => {
  assert.equal(
    cleanPathString("'C:\\Users\\hacks\\OneDrive\\Documents\\SOW.docx'"),
    "C:\\Users\\hacks\\OneDrive\\Documents\\SOW.docx",
  );
});

test("strips smart quotes from chat / email pastes", () => {
  assert.equal(
    cleanPathString("\u201CC:\\Users\\hacks\\Docs\\Plan.pdf\u201D"),
    "C:\\Users\\hacks\\Docs\\Plan.pdf",
  );
  assert.equal(
    cleanPathString("\u2018/home/me/plan.md\u2019"),
    "/home/me/plan.md",
  );
});

test("strips backticks", () => {
  assert.equal(cleanPathString("`/tmp/a.md`"), "/tmp/a.md");
});

test("trims surrounding whitespace", () => {
  assert.equal(cleanPathString("   C:\\foo\\bar.docx   "), "C:\\foo\\bar.docx");
});

test("handles whitespace inside the quotes too", () => {
  assert.equal(
    cleanPathString('   "  C:\\foo\\bar.docx  "  '),
    "C:\\foo\\bar.docx",
  );
});

test("trims trailing punctuation that rides along with chat pastes", () => {
  assert.equal(cleanPathString("/tmp/foo.md,"), "/tmp/foo.md");
  assert.equal(cleanPathString("/tmp/foo.md."), "/tmp/foo.md.");
  assert.equal(cleanPathString("/tmp/foo.md;"), "/tmp/foo.md");
  assert.equal(cleanPathString("(/tmp/foo.md)"), "(/tmp/foo.md");
});

test("preserves spaces inside the path", () => {
  assert.equal(
    cleanPathString('"C:\\Users\\hacks\\OneDrive\\Documents\\SOW - Squash.docx"'),
    "C:\\Users\\hacks\\OneDrive\\Documents\\SOW - Squash.docx",
  );
});

test("handles empty input", () => {
  assert.equal(cleanPathString(""), "");
  assert.equal(cleanPathString("   "), "");
});

test("handles nested quote layers (paste-in-paste)", () => {
  assert.equal(
    cleanPathString("\"'C:\\path\\file.docx'\""),
    "C:\\path\\file.docx",
  );
});
