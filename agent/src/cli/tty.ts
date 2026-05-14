import { stdout } from "node:process";

/**
 * Tiny ANSI helpers and process-wide terminal cleanup.
 *
 * Anything that hides the cursor or switches stdin to raw mode MUST register
 * cleanup via {@link onCleanup} so we leave the terminal usable on Ctrl+C
 * or unexpected exits.
 */

export const ansi = {
  hideCursor: "\u001b[?25l",
  showCursor: "\u001b[?25h",
  clearLine: "\r\u001b[2K",
  moveUp: (n: number): string => (n > 0 ? `\u001b[${n}A` : ""),
} as const;

export function isAnimationEnabled(): boolean {
  if (!stdout.isTTY) return false;
  if (process.env["NO_COLOR"]) return false;
  if (process.env["NYLON_NO_ANIMATION"]) return false;
  if (process.env["CI"]) return false;
  return true;
}

const cleanups = new Set<() => void>();

let installed = false;
function installCleanupHandler(): void {
  if (installed) return;
  installed = true;
  const run = (): void => {
    for (const fn of [...cleanups].reverse()) {
      try {
        fn();
      } catch {
        // Swallow - we're shutting down anyway.
      }
    }
    cleanups.clear();
  };
  process.on("exit", run);
  process.on("SIGINT", () => {
    run();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    run();
    process.exit(143);
  });
}

/**
 * Register a function to be called on process exit / signal. Returns a
 * disposer so callers can unregister early (the common case for prompts
 * that finish normally).
 */
export function onCleanup(fn: () => void): () => void {
  installCleanupHandler();
  cleanups.add(fn);
  return () => cleanups.delete(fn);
}
