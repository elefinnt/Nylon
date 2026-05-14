import { argv as processArgv, stdin, stdout } from "node:process";

import { runMenuCommand } from "./cli/commands/menu.js";
import { runCli } from "./cli/run.js";
import { logger } from "./util/log.js";
import { dispatch } from "./pipeline/dispatch.js";
import { parseRequestLine, writeEvent } from "./protocol.js";

async function main(): Promise<void> {
  const argv = processArgv.slice(2);

  // Argv mode: the user invoked us as `nylon …` from a shell.
  // Anything with arguments goes through the human-friendly CLI.
  if (argv.length > 0) {
    const outcome = await runCli(argv);
    if (outcome.kind === "exit") {
      process.exit(outcome.code);
    }
    return;
  }

  // No argv: interactive users expect bare `nylon` to open the same UI as
  // `nylon menu`. When stdin is not a TTY we stay on NDJSON stdin IPC so the
  // native shim and pipe-driven callers keep working unchanged.
  if (stdin.isTTY) {
    const code = await runMenuCommand();
    process.exit(code);
  }

  await runIpcMode();
}

async function runIpcMode(): Promise<void> {
  let buffer = "";
  let stdinClosed = false;
  const inFlight = new Set<Promise<void>>();

  stdin.setEncoding("utf8");

  const enqueue = (line: string): void => {
    const promise = handleLine(line).catch((err: unknown) => {
      logger.error({ err }, "Unhandled error while handling request line");
      writeEvent({
        type: "error",
        code: "INTERNAL",
        message: err instanceof Error ? err.message : String(err),
      });
    });
    inFlight.add(promise);
    void promise.finally(() => {
      inFlight.delete(promise);
      maybeExit();
    });
  };

  const maybeExit = (): void => {
    if (stdinClosed && inFlight.size === 0) {
      process.exit(0);
    }
  };

  const drainBuffer = (): void => {
    let newlineIdx = buffer.indexOf("\n");
    while (newlineIdx !== -1) {
      const line = buffer.slice(0, newlineIdx).replace(/\r$/, "");
      buffer = buffer.slice(newlineIdx + 1);
      newlineIdx = buffer.indexOf("\n");
      if (line.trim() === "") continue;
      enqueue(line);
    }
  };

  stdin.on("data", (chunk: string) => {
    buffer += chunk;
    drainBuffer();
  });

  stdin.on("end", () => {
    stdinClosed = true;
    // Flush any trailing line that wasn't newline-terminated (common when
    // piping a single command in PowerShell or bash).
    const trailing = buffer.replace(/\r$/, "").trim();
    if (trailing.length > 0) {
      buffer = "";
      enqueue(trailing);
    }
    maybeExit();
  });

  stdout.on("error", () => {
    process.exit(0);
  });
}

async function handleLine(line: string): Promise<void> {
  const parsed = parseRequestLine(line);
  if (!parsed.success) {
    writeEvent({ type: "error", code: "BAD_REQUEST", message: parsed.error });
    return;
  }
  await dispatch(parsed.data);
}

main().catch((err) => {
  logger.error({ err }, "Fatal error in agent main");
  process.exit(1);
});
