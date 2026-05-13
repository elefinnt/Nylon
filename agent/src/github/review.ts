import type { Octokit } from "@octokit/rest";

import type { ParsedPrUrl } from "../pipeline/url.js";
import type { PullRequestSnapshot, ReviewComment, ReviewOutput } from "../providers/types.js";
import { AgentError } from "../util/errors.js";

export interface PostReviewResult {
  reviewUrl: string;
  postedComments: number;
  droppedComments: number;
}

export interface PostReviewInput {
  parsed: ParsedPrUrl;
  pr: PullRequestSnapshot;
  output: ReviewOutput;
  providerId: string;
  modelId: string;
}

export async function postReview(
  octokit: Octokit,
  input: PostReviewInput,
): Promise<PostReviewResult> {
  const validFiles = new Set(input.pr.files.map((f) => f.filename));
  const anchorable: ReviewComment[] = [];
  const orphan: ReviewComment[] = [];
  for (const c of input.output.comments) {
    if (!validFiles.has(c.path)) {
      orphan.push(c);
      continue;
    }
    // Best-effort: we trust the model on line numbers but GitHub will reject
    // anchors outside the diff. We catch those below and degrade gracefully.
    anchorable.push(c);
  }

  const body = renderSummary(input.output, input.providerId, input.modelId, orphan);

  const created = await tryCreateReview(octokit, input.parsed, body, anchorable);
  if (created.ok) {
    return {
      reviewUrl: created.url,
      postedComments: anchorable.length - created.droppedAnchors,
      droppedComments: orphan.length + created.droppedAnchors,
    };
  }

  // GitHub rejected one or more inline anchors. Fall back to summary-only.
  const summaryOnly = await octokit.pulls.createReview({
    owner: input.parsed.owner,
    repo: input.parsed.repo,
    pull_number: input.parsed.number,
    body: body + renderInlineFallback([...orphan, ...anchorable]),
    event: "COMMENT",
  });
  return {
    reviewUrl: summaryOnly.data.html_url,
    postedComments: 0,
    droppedComments: input.output.comments.length,
  };
}

interface CreateOk {
  ok: true;
  url: string;
  droppedAnchors: number;
}
interface CreateFailed {
  ok: false;
}

async function tryCreateReview(
  octokit: Octokit,
  parsed: ParsedPrUrl,
  body: string,
  comments: ReviewComment[],
): Promise<CreateOk | CreateFailed> {
  if (comments.length === 0) {
    const response = await octokit.pulls.createReview({
      owner: parsed.owner,
      repo: parsed.repo,
      pull_number: parsed.number,
      body,
      event: "COMMENT",
    });
    return { ok: true, url: response.data.html_url, droppedAnchors: 0 };
  }

  const payload = comments.map((c) => ({
    path: c.path,
    line: c.line,
    side: c.side,
    body: renderComment(c),
  }));

  try {
    const response = await octokit.pulls.createReview({
      owner: parsed.owner,
      repo: parsed.repo,
      pull_number: parsed.number,
      body,
      event: "COMMENT",
      comments: payload,
    });
    return { ok: true, url: response.data.html_url, droppedAnchors: 0 };
  } catch (err: unknown) {
    const message = (err as Error).message ?? "";
    if (/pull_request_review_thread\.line|not part of the diff/i.test(message)) {
      return { ok: false };
    }
    throw new AgentError(
      "GITHUB_REVIEW_FAILED",
      `Could not post review to ${parsed.owner}/${parsed.repo}#${parsed.number}: ${message}`,
    );
  }
}

function renderSummary(
  output: ReviewOutput,
  providerId: string,
  modelId: string,
  orphans: ReviewComment[],
): string {
  const parts: string[] = [];
  parts.push(`### Automated review (${providerId} \u00b7 ${modelId})`);
  parts.push("");
  parts.push(`**Risk level:** ${output.riskLevel}`);
  parts.push("");
  parts.push(output.summary.trim());
  if (output.followUps.length > 0) {
    parts.push("");
    parts.push("**Suggested follow-ups**");
    for (const f of output.followUps) parts.push(`- ${f}`);
  }
  if (orphans.length > 0) {
    parts.push("");
    parts.push("<details><summary>Comments that could not be anchored to the diff</summary>");
    parts.push("");
    for (const c of orphans) parts.push(`- \`${c.path}:${c.line}\`: ${c.body.replace(/\n+/g, " ")}`);
    parts.push("</details>");
  }
  parts.push("");
  parts.push("_Reviewed by pr-agent. This is an AI suggestion, not a human approval._");
  return parts.join("\n");
}

function renderInlineFallback(comments: ReviewComment[]): string {
  if (comments.length === 0) return "";
  const lines = ["", "", "#### Inline notes (rendered here because line anchors did not match the diff)"];
  for (const c of comments) {
    lines.push(`- **${labelForSeverity(c.severity)}** \`${c.path}:${c.line}\`: ${c.body.replace(/\n+/g, " ")}`);
  }
  return lines.join("\n");
}

function renderComment(c: ReviewComment): string {
  return `**${labelForSeverity(c.severity)}**\n\n${c.body}`;
}

function labelForSeverity(severity: ReviewComment["severity"]): string {
  switch (severity) {
    case "info":
      return "Info";
    case "suggestion":
      return "Suggestion";
    case "warning":
      return "Warning";
    case "issue":
      return "Issue";
  }
}
