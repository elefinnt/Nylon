/**
 * Hand-tuned mock data for the task exporter demo flow. Picked to look
 * realistic on a recorded video without claiming to be live data.
 *
 * Each integration tells the same story shape: connect → scan → map →
 * push → summarise. Field names and IDs are styled per-provider so it
 * still feels like the real product when seen briefly.
 */

export type IntegrationId = "monday" | "jira" | "clickup";

export interface MockTaskRow {
  /** ID surface (ticket key, item id, etc.). */
  id: string;
  title: string;
  /** Destination column / status / list shown on the right. */
  destination: string;
}

export interface MockBoard {
  name: string;
  hint: string;
}

export interface IntegrationMock {
  id: IntegrationId;
  displayName: string;
  /** Hostname-ish line used during the connect step. */
  endpoint: string;
  workspace: string;
  /** Account label shown after auth. */
  account: string;
  /** Scan progress line ("Scanning <thing>..."). */
  scanLabel: string;
  /** Total items "discovered" in the scan. */
  discovered: number;
  boards: ReadonlyArray<MockBoard>;
  tasks: ReadonlyArray<MockTaskRow>;
  /** Hyperlink-shaped string shown in the summary card. */
  summaryUrl: string;
}

const MONDAY: IntegrationMock = {
  id: "monday",
  displayName: "Monday.com",
  endpoint: "api.monday.com/v2",
  workspace: "Acme Engineering",
  account: "you@acme.dev (admin)",
  scanLabel: "Scanning recent commits + PR descriptions",
  discovered: 12,
  boards: [
    { name: "Sprint Q2-2026", hint: "active sprint" },
    { name: "Bug triage", hint: "shared inbox" },
    { name: "Tech debt", hint: "rolling backlog" },
  ],
  tasks: [
    { id: "M-4821", title: "Wire nylon menu animations", destination: "Sprint Q2-2026 / In progress" },
    { id: "M-4822", title: "Mock task exporter pipeline", destination: "Sprint Q2-2026 / In progress" },
    { id: "M-4823", title: "Handle stdin not-a-TTY in menu", destination: "Bug triage / Triaged" },
    { id: "M-4824", title: "Cap files at 500 LOC across CLI", destination: "Tech debt / Todo" },
    { id: "M-4825", title: "Document NO_COLOR + NYLON_NO_ANIMATION", destination: "Tech debt / Todo" },
  ],
  summaryUrl: "https://acme.monday.com/boards/4821/views/sprint-q2",
};

const JIRA: IntegrationMock = {
  id: "jira",
  displayName: "Jira",
  endpoint: "acme.atlassian.net/rest/api/3",
  workspace: "Acme / PR-AGENT project",
  account: "you@acme.dev (jira-developers)",
  scanLabel: "Scanning open PRs for issue intents",
  discovered: 8,
  boards: [
    { name: "PRAG-EPIC-12", hint: "CLI polish" },
    { name: "PRAG-EPIC-17", hint: "Task exporter" },
    { name: "PRAG-EPIC-9", hint: "Provider parity" },
  ],
  tasks: [
    { id: "PRAG-318", title: "Animated menu reveal", destination: "PRAG-EPIC-12 / In progress" },
    { id: "PRAG-319", title: "Progress bar primitive", destination: "PRAG-EPIC-12 / In progress" },
    { id: "PRAG-320", title: "Task exporter demo flow", destination: "PRAG-EPIC-17 / In review" },
    { id: "PRAG-321", title: "Surface --no-animation flag", destination: "PRAG-EPIC-12 / Todo" },
    { id: "PRAG-322", title: "Cursor SDK provider parity check", destination: "PRAG-EPIC-9 / Backlog" },
  ],
  summaryUrl: "https://acme.atlassian.net/jira/software/projects/PRAG/boards/4",
};

const CLICKUP: IntegrationMock = {
  id: "clickup",
  displayName: "ClickUp",
  endpoint: "api.clickup.com/v2",
  workspace: "Acme / Engineering space",
  account: "you@acme.dev (workspace owner)",
  scanLabel: "Walking lists for tasks without external refs",
  discovered: 6,
  boards: [
    { name: "CLI", hint: "list" },
    { name: "Agent runtime", hint: "list" },
    { name: "Docs", hint: "list" },
  ],
  tasks: [
    { id: "CU-8a1b2c", title: "Menu animations + banner reveal", destination: "CLI / In progress" },
    { id: "CU-8a1b2d", title: "Mock task exporter visual demo", destination: "CLI / In progress" },
    { id: "CU-8a1b2e", title: "Document task exporter API contract", destination: "Docs / Todo" },
    { id: "CU-8a1b2f", title: "Spinner cleanup on SIGINT", destination: "Agent runtime / Done" },
  ],
  summaryUrl: "https://app.clickup.com/12345/v/li/901234",
};

const ALL: Record<IntegrationId, IntegrationMock> = {
  monday: MONDAY,
  jira: JIRA,
  clickup: CLICKUP,
};

export function getIntegrationMock(id: IntegrationId): IntegrationMock {
  return ALL[id];
}

/**
 * Engineering-flavoured task strings that get "extracted" from
 * whatever path the user points the demo at. Picked at random per
 * run so the same path looks fresh across recordings.
 */
export const EXTRACTED_TASK_POOL: ReadonlyArray<string> = [
  "Fix flaky e2e: invoices.spec — race on toast timer",
  "Make /api/users return 401 instead of 500 on bad token",
  "audit_logs is missing index on (account_id, created_at)",
  "Switch test runner to vitest, drop ts-jest",
  "Add structured logging to PR ingestion worker",
  "Rotate datadog API keys — last rotated jan",
  "Onboarding empty-state still says 'Acme Inc.'",
  "Backfill OAuth scopes for legacy github installs",
  "Document the env var fallback order in README",
  "Spinner doesn't clean up on SIGTERM in CI",
  "Add e2e for PR review with no diff",
  "Cap config file at 0600 on linux too, not just mac",
  "Replace hand-rolled toml parser with smol-toml",
  "Profile chunking pass — 300ms on big diffs",
  "Investigate retry storm on rate-limited 403",
  "Move API keys out of .env.example into 1Password",
  "Provider parity test: cursor vs openai output shape",
  "Cache octokit instance per github token",
  "Drop unused --legacy flag from review cmd",
  "Sync our PR template with .github/PULL_REQUEST_TEMPLATE.md",
  "Spike: swap pino for node:util.styleText logger",
  "Add `nylon doctor` command for env diagnostics",
  "Wire monday.com client behind a feature flag",
  "Off-by-one in the progress bar suffix",
  "Tighten retries on github 5xx — currently fires twice",
  "Mute pino logs during interactive menu sessions",
  "Make the wizard remember last-picked provider",
  "Hide the `init --from-env` flag from `--help` shorthand",
  "Track menu-flow latency for the upcoming demo metrics page",
  "Add a 'cancel review' affordance to the spinner UI",
];
