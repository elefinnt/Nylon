import test from "node:test";
import assert from "node:assert/strict";

import { parsePrUrl } from "../src/pipeline/url.js";

test("parses a canonical PR url", () => {
  const r = parsePrUrl("https://github.com/acme/widgets/pull/42");
  assert.deepEqual(r, { owner: "acme", repo: "widgets", number: 42 });
});

test("ignores trailing path", () => {
  const r = parsePrUrl("https://github.com/acme/widgets/pull/42/files");
  assert.equal(r.number, 42);
});

test("rejects non-github urls", () => {
  assert.throws(() => parsePrUrl("https://example.com/a/b/pull/1"));
});

test("rejects malformed urls", () => {
  assert.throws(() => parsePrUrl("not a url"));
});
