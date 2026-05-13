import pino from "pino";

// All logs go to stderr so they never interleave with the NDJSON wire protocol
// on stdout. The CLI surfaces them only when run with --verbose.
export const logger = pino(
  {
    level: process.env["PR_AGENT_LOG_LEVEL"] ?? "info",
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.destination({ fd: 2, sync: false }),
);
