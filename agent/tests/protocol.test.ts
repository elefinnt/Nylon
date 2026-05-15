import test from "node:test";
import assert from "node:assert/strict";

import { parseRequestLine } from "../src/protocol.js";

test("ping is parsed", () => {
  const r = parseRequestLine('{"type":"ping"}');
  assert.equal(r.success, true);
  if (r.success) assert.equal(r.data.type, "ping");
});

test("review requires url, provider, model", () => {
  const r = parseRequestLine('{"type":"review","url":"not-a-url"}');
  assert.equal(r.success, false);
});

test("valid review parses", () => {
  const r = parseRequestLine(
    '{"type":"review","url":"https://github.com/a/b/pull/1","provider":"anthropic","model":"claude-opus-4-7"}',
  );
  assert.equal(r.success, true);
  if (r.success) {
    assert.equal(r.data.type, "review");
    if (r.data.type === "review") {
      assert.equal(r.data.postReview, true);
    }
  }
});

test("unknown type is rejected", () => {
  const r = parseRequestLine('{"type":"unknown"}');
  assert.equal(r.success, false);
});

test("non-json is rejected with a clear message", () => {
  const r = parseRequestLine("not json");
  assert.equal(r.success, false);
  if (!r.success) assert.match(r.error, /Invalid JSON/);
});
