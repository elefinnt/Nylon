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
  requestChangesOnIssue?: boolean;
  applyLabels?: boolean;
}

type AnchorableComment = ReviewComment & { line: number };

export async function postReview(
  octokit: Octokit,
  input: PostReviewInput,
): Promise<PostReviewResult> {
  const validFiles = new Set(input.pr.files.map((f) => f.filename));
  const anchorable: AnchorableComment[] = [];
  const orphan: ReviewComment[] = [];
  for (const c of input.output.comments) {
    // A comment can't be anchored if the file is not in the diff, or if the
    // model couldn't pick a specific line (line === null, e.g. file-level
    // feedback). Both cases get rendered in the summary "could not be
    // anchored" block so nothing is silently dropped.
    if (!validFiles.has(c.path) || c.line === null) {
      orphan.push(c);
      continue;
    }
    anchorable.push({ ...c, line: c.line });
  }

  const event = deriveReviewEvent(input.output, input.requestChangesOnIssue ?? false);
  const body = renderSummary(input.output, input.providerId, input.modelId, orphan);

  const created = await tryCreateReview(octokit, input.parsed, body, anchorable, event);

  let result: PostReviewResult;
  if (created.ok) {
    result = {
      reviewUrl: created.url,
      postedComments: anchorable.length - created.droppedAnchors,
      droppedComments: orphan.length + created.droppedAnchors,
    };
  } else {
    // GitHub rejected one or more inline anchors. Fall back to summary-only.
    const summaryOnly = await octokit.pulls.createReview({
      owner: input.parsed.owner,
      repo: input.parsed.repo,
      pull_number: input.parsed.number,
      body: body + renderInlineFallback([...orphan, ...anchorable]),
      event,
    });
    result = {
      reviewUrl: summaryOnly.data.html_url,
      postedComments: 0,
      droppedComments: input.output.comments.length,
    };
  }

  if (input.applyLabels) {
    await applyReviewLabels(octokit, input.parsed, deriveLabels(input.output));
  }

  return result;
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
  comments: AnchorableComment[],
  event: "COMMENT" | "REQUEST_CHANGES",
): Promise<CreateOk | CreateFailed> {
  if (comments.length === 0) {
    const response = await octokit.pulls.createReview({
      owner: parsed.owner,
      repo: parsed.repo,
      pull_number: parsed.number,
      body,
      event,
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
      event,
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
    for (const c of orphans) parts.push(`- ${formatAnchor(c)}: ${c.body.replace(/\n+/g, " ")}`);
    parts.push("</details>");
  }
  parts.push("");
  parts.push("_Reviewed by [Nylon](https://github.com/elefinnt/Nylon)._");
  return parts.join("\n");
}

function renderInlineFallback(comments: ReviewComment[]): string {
  if (comments.length === 0) return "";
  const lines = ["", "", "#### Inline notes (rendered here because line anchors did not match the diff)"];
  for (const c of comments) {
    lines.push(`- **${labelForSeverity(c.severity)}** ${formatAnchor(c)}: ${c.body.replace(/\n+/g, " ")}`);
  }
  return lines.join("\n");
}

function formatAnchor(c: ReviewComment): string {
  return c.line === null ? `\`${c.path}\`` : `\`${c.path}:${c.line}\``;
}

function renderComment(c: ReviewComment): string {
  return `**${labelForSeverity(c.severity)}**\n\n${c.body}`;
}

function deriveReviewEvent(
  output: ReviewOutput,
  requestChangesOnIssue: boolean,
): "COMMENT" | "REQUEST_CHANGES" {
  if (!requestChangesOnIssue) return "COMMENT";
  if (output.riskLevel === "high" || output.comments.some(c => c.severity === "issue")) {
    return "REQUEST_CHANGES";
  }
  return "COMMENT";
}

function deriveLabels(output: ReviewOutput): string[] {
  const labels: string[] = [];
  if (output.riskLevel === "high") labels.push("high-risk");
  if (output.comments.some(c => c.severity === "issue")) labels.push("needs-fixes");
  if (output.followUps.length > 0) labels.push("follow-up-needed");
  return labels;
}

async function applyReviewLabels(
  octokit: Octokit,
  parsed: ParsedPrUrl,
  labels: string[],
): Promise<void> {
  if (labels.length === 0) return;
  try {
    await octokit.issues.addLabels({
      owner: parsed.owner,
      repo: parsed.repo,
      issue_number: parsed.number,
      labels,
    });
  } catch {
    // Labels may not exist on the repository; fail silently.
  }
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
