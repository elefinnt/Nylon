/**
 * Tiny zero-dependency argv parser for the `pr-review` CLI.
 *
 * Surface:
 *   pr-review init [--force]
 *   pr-review providers
 *   pr-review review <pr-url> [--dry|-n] [--provider|-p <id>] [--model|-m <id>]
 *                              [--verbose|-v]
 *   pr-review <pr-url>             (alias for `review <pr-url>`)
 *   pr-review --help|-h
 *   pr-review --version|-V
 *
 * Anything that doesn't look like an argv command (i.e. argv length 0) falls
 * through to the legacy NDJSON-on-stdin IPC mode that the C++ binary uses.
 */

export type CliCommand =
  | { kind: "help"; topic?: string }
  | { kind: "version" }
  | { kind: "init"; force: boolean; fromEnv: boolean }
  | { kind: "providers" }
  | {
      kind: "review";
      url: string;
      provider?: string;
      model?: string;
      dry: boolean;
      verbose: boolean;
    };

export type ParseOutcome =
  | { kind: "command"; command: CliCommand }
  | { kind: "ipc" }
  | { kind: "error"; message: string; exitCode: number };

const HELP_FLAGS = new Set(["-h", "--help", "help"]);
const VERSION_FLAGS = new Set(["-V", "--version"]);

export function parseArgv(argv: readonly string[]): ParseOutcome {
  if (argv.length === 0) {
    return { kind: "ipc" };
  }

  const first = argv[0];
  if (first === undefined) return { kind: "ipc" };

  if (HELP_FLAGS.has(first)) {
    return { kind: "command", command: { kind: "help", topic: argv[1] } };
  }
  if (VERSION_FLAGS.has(first)) {
    return { kind: "command", command: { kind: "version" } };
  }

  switch (first) {
    case "init":
      return parseInit(argv.slice(1));
    case "providers":
      return parseProviders(argv.slice(1));
    case "review":
      return parseReview(argv.slice(1));
    default:
      if (looksLikeUrl(first)) {
        return parseReview(argv);
      }
      return {
        kind: "error",
        message: `Unknown command: ${first}. Run \`pr-review --help\`.`,
        exitCode: 64,
      };
  }
}

function parseInit(rest: readonly string[]): ParseOutcome {
  let force = false;
  let fromEnv = false;
  for (const arg of rest) {
    if (arg === "--force" || arg === "-f") {
      force = true;
      continue;
    }
    if (arg === "--from-env" || arg === "--non-interactive") {
      fromEnv = true;
      continue;
    }
    if (HELP_FLAGS.has(arg)) {
      return { kind: "command", command: { kind: "help", topic: "init" } };
    }
    return {
      kind: "error",
      message: `Unknown option for \`init\`: ${arg}`,
      exitCode: 64,
    };
  }
  return { kind: "command", command: { kind: "init", force, fromEnv } };
}

function parseProviders(rest: readonly string[]): ParseOutcome {
  for (const arg of rest) {
    if (HELP_FLAGS.has(arg)) {
      return { kind: "command", command: { kind: "help", topic: "providers" } };
    }
    return {
      kind: "error",
      message: `\`providers\` takes no arguments (got ${arg}).`,
      exitCode: 64,
    };
  }
  return { kind: "command", command: { kind: "providers" } };
}

function parseReview(rest: readonly string[]): ParseOutcome {
  let url: string | undefined;
  let provider: string | undefined;
  let model: string | undefined;
  let dry = false;
  let verbose = false;

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === undefined) continue;

    if (HELP_FLAGS.has(arg)) {
      return { kind: "command", command: { kind: "help", topic: "review" } };
    }
    if (arg === "--dry" || arg === "--dry-run" || arg === "-n") {
      dry = true;
      continue;
    }
    if (arg === "--verbose" || arg === "-v") {
      verbose = true;
      continue;
    }
    if (arg === "--provider" || arg === "-p") {
      provider = takeValue(rest, ++i, arg);
      continue;
    }
    if (arg.startsWith("--provider=")) {
      provider = arg.slice("--provider=".length);
      continue;
    }
    if (arg === "--model" || arg === "-m") {
      model = takeValue(rest, ++i, arg);
      continue;
    }
    if (arg.startsWith("--model=")) {
      model = arg.slice("--model=".length);
      continue;
    }
    if (arg.startsWith("-")) {
      return {
        kind: "error",
        message: `Unknown flag: ${arg}`,
        exitCode: 64,
      };
    }
    if (url === undefined) {
      url = arg;
      continue;
    }
    return {
      kind: "error",
      message: `Unexpected positional argument: ${arg}`,
      exitCode: 64,
    };
  }

  if (!url) {
    return {
      kind: "error",
      message: "Missing pull request URL. Usage: pr-review review <pr-url>",
      exitCode: 64,
    };
  }
  if (!looksLikeUrl(url)) {
    return {
      kind: "error",
      message: `\`${url}\` does not look like a GitHub pull request URL.`,
      exitCode: 64,
    };
  }

  const command: CliCommand = {
    kind: "review",
    url,
    dry,
    verbose,
  };
  if (provider !== undefined) command.provider = provider;
  if (model !== undefined) command.model = model;
  return { kind: "command", command };
}

function takeValue(rest: readonly string[], idx: number, flag: string): string {
  const value = rest[idx];
  if (value === undefined || value.startsWith("-")) {
    throw new ArgvError(`${flag} expects a value.`);
  }
  return value;
}

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export class ArgvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArgvError";
  }
}
