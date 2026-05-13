import { AgentError } from "../util/errors.js";

export interface ParsedPrUrl {
  owner: string;
  repo: string;
  number: number;
}

const URL_RE = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:[/?#].*)?$/;

export function parsePrUrl(input: string): ParsedPrUrl {
  const trimmed = input.trim();
  const match = URL_RE.exec(trimmed);
  if (!match) {
    throw new AgentError(
      "BAD_URL",
      `Not a GitHub pull request URL: ${input}\n` +
        "Expected: https://github.com/<owner>/<repo>/pull/<number>",
    );
  }
  const [, owner, repo, num] = match;
  return {
    owner: owner ?? "",
    repo: repo ?? "",
    number: Number(num),
  };
}
