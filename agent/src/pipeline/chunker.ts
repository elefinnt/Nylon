import type { PullRequestSnapshot } from "../providers/types.js";

/**
 * v1 chunker: returns the snapshot as-is if it fits a soft size budget,
 * otherwise drops the largest binary-ish files (no patch) and clamps the
 * diff to a max character length. Real multi-pass chunking lands later.
 */
export function chunk(pr: PullRequestSnapshot, opts: { maxDiffChars?: number } = {}): PullRequestSnapshot {
  const maxDiffChars = opts.maxDiffChars ?? 180_000;
  if (pr.unifiedDiff.length <= maxDiffChars) return pr;

  const trimmed = pr.unifiedDiff.slice(0, maxDiffChars) +
    `\n... [diff truncated at ${maxDiffChars} characters of ${pr.unifiedDiff.length}] ...`;
  return { ...pr, unifiedDiff: trimmed };
}
