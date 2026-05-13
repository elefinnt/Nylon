import { stdin, stdout } from "node:process";

import { logger } from "./util/log.js";
import { dispatch } from "./pipeline/dispatch.js";
import { parseRequestLine, writeEvent } from "./protocol.js";

async function main(): Promise<void> {
  let buffer = "";
  stdin.setEncoding("utf8");

  stdin.on("data", (chunk: string) => {
    buffer += chunk;
    let newlineIdx = buffer.indexOf("\n");
    while (newlineIdx !== -1) {
      const line = buffer.slice(0, newlineIdx).replace(/\r$/, "");
      buffer = buffer.slice(newlineIdx + 1);
      newlineIdx = buffer.indexOf("\n");
      if (line.trim() === "") continue;

      handleLine(line).catch((err: unknown) => {
        logger.error({ err }, "Unhandled error while handling request line");
        writeEvent({
          type: "error",
          code: "INTERNAL",
          message: err instanceof Error ? err.message : String(err),
        });
      });
    }
  });

  stdin.on("end", () => {
    process.exit(0);
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
