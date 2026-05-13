import { Octokit } from "@octokit/rest";

import { version } from "../version.js";

export interface GithubClientOptions {
  token: string;
  baseUrl?: string;
}

export function createOctokit(opts: GithubClientOptions): Octokit {
  return new Octokit({
    auth: opts.token,
    userAgent: `pr-agent/${version}`,
    baseUrl: opts.baseUrl,
  });
}
