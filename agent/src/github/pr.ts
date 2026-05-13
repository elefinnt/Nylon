import type { Octokit } from "@octokit/rest";

import type { PullRequestSnapshot } from "../providers/types.js";
import { AgentError } from "../util/errors.js";
import type { ParsedPrUrl } from "../pipeline/url.js";

export interface FetchedFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

export async function fetchPullRequest(
  octokit: Octokit,
  parsed: ParsedPrUrl,
): Promise<PullRequestSnapshot> {
  const { owner, repo, number } = parsed;

  const pr = await octokit.pulls.get({ owner, repo, pull_number: number }).catch((err: unknown) => {
    throw new AgentError(
      "GITHUB_PR_NOT_FOUND",
      `Could not fetch PR ${owner}/${repo}#${number}: ${(err as Error).message}`,
    );
  });

  const files = await octokit.paginate(octokit.pulls.listFiles, {
    owner,
    repo,
    pull_number: number,
    per_page: 100,
  });

  const diff = await fetchUnifiedDiff(octokit, parsed);

  const mapped: FetchedFile[] = files.map((f) => ({
    filename: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    patch: f.patch,
  }));

  return {
    owner,
    repo,
    number,
    title: pr.data.title,
    body: pr.data.body ?? "",
    baseSha: pr.data.base.sha,
    headSha: pr.data.head.sha,
    files: mapped,
    unifiedDiff: diff,
  };
}

async function fetchUnifiedDiff(octokit: Octokit, parsed: ParsedPrUrl): Promise<string> {
  const { owner, repo, number } = parsed;
  try {
    const response = await octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
      owner,
      repo,
      pull_number: number,
      mediaType: { format: "diff" },
    });
    return typeof response.data === "string" ? response.data : String(response.data ?? "");
  } catch (err: unknown) {
    throw new AgentError(
      "GITHUB_DIFF_FAILED",
      `Could not fetch unified diff for ${owner}/${repo}#${number}: ${(err as Error).message}`,
    );
  }
}

export function summariseFiles(files: ReadonlyArray<FetchedFile>): string {
  const totalAdd = files.reduce((a, f) => a + f.additions, 0);
  const totalDel = files.reduce((a, f) => a + f.deletions, 0);
  return `${files.length} files, +${totalAdd} / -${totalDel} lines`;
}
