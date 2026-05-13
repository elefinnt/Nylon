import { stdin, stdout } from "node:process";

import { paint } from "./render.js";
import { ansi, isAnimationEnabled, onCleanup } from "./tty.js";

export interface SelectItem<T extends string> {
  id: T;
  label: string;
  hint?: string;
}

export interface SelectOptions<T extends string> {
  label: string;
  items: ReadonlyArray<SelectItem<T>>;
  defaultId?: T;
}

/**
 * Renders an arrow-key navigable picker on a TTY. Returns the chosen id.
 *
 * Keys: Up/Down (and j/k), 1-9 number shortcuts, Enter to confirm,
 * Ctrl+C to abort. Falls back to throwing if stdin isn't a TTY -
 * Prompter.choice handles that case with a numeric fallback.
 */
export function isInteractiveSelectSupported(): boolean {
  return Boolean(stdin.isTTY) && isAnimationEnabled();
}

export function interactiveSelect<T extends string>(opts: SelectOptions<T>): Promise<T> {
  if (!isInteractiveSelectSupported()) {
    return Promise.reject(new Error("interactiveSelect requires a TTY stdin/stdout."));
  }
  if (opts.items.length === 0) {
    return Promise.reject(new Error("interactiveSelect: at least one item is required."));
  }

  return new Promise<T>((resolve, reject) => {
    let cursor = Math.max(
      0,
      opts.defaultId ? opts.items.findIndex((i) => i.id === opts.defaultId) : 0,
    );

    const wasRaw = stdin.isRaw === true;
    const wasPaused = stdin.isPaused();

    stdout.write(ansi.hideCursor);
    stdout.write(`${opts.label}\n`);
    stdout.write(paint.dim("  (arrows to move, enter to select, Ctrl+C to cancel)\n"));
    renderList(opts.items, cursor);

    let cleanedUp = false;
    const dispose = onCleanup(() => cleanup());

    const cleanup = (): void => {
      if (cleanedUp) return;
      cleanedUp = true;
      stdin.removeListener("data", onData);
      try {
        stdin.setRawMode(wasRaw);
      } catch {
        // Some environments disallow toggling raw mode; ignore.
      }
      if (wasPaused) stdin.pause();
      stdout.write(ansi.showCursor);
      dispose();
    };

    const onData = (chunk: Buffer): void => {
      const str = chunk.toString("utf8");

      // Ctrl+C
      if (str === "\u0003") {
        finishWithList(opts.items, cursor, "abort");
        cleanup();
        reject(new SelectCancelled());
        return;
      }

      // Enter
      if (str === "\r" || str === "\n") {
        const picked = opts.items[cursor];
        if (!picked) return;
        finishWithList(opts.items, cursor, "commit", picked);
        cleanup();
        resolve(picked.id);
        return;
      }

      // Arrow keys (CSI A/B) and j/k for vim folks
      if (str === "\u001b[A" || str === "k") {
        cursor = (cursor - 1 + opts.items.length) % opts.items.length;
        redraw(opts.items, cursor);
        return;
      }
      if (str === "\u001b[B" || str === "j") {
        cursor = (cursor + 1) % opts.items.length;
        redraw(opts.items, cursor);
        return;
      }

      // Home/End
      if (str === "\u001b[H" || str === "g") {
        cursor = 0;
        redraw(opts.items, cursor);
        return;
      }
      if (str === "\u001b[F" || str === "G") {
        cursor = opts.items.length - 1;
        redraw(opts.items, cursor);
        return;
      }

      // Numeric shortcut: 1-9 jumps and selects
      if (/^[1-9]$/.test(str)) {
        const idx = Number.parseInt(str, 10) - 1;
        if (idx < opts.items.length) {
          cursor = idx;
          const picked = opts.items[idx];
          if (!picked) return;
          finishWithList(opts.items, cursor, "commit", picked);
          cleanup();
          resolve(picked.id);
        }
      }
    };

    try {
      stdin.setRawMode(true);
    } catch (err: unknown) {
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    stdin.resume();
    stdin.on("data", onData);
  });
}

export class SelectCancelled extends Error {
  constructor() {
    super("Selection cancelled by user.");
    this.name = "SelectCancelled";
  }
}

function renderList<T extends string>(items: ReadonlyArray<SelectItem<T>>, cursor: number): void {
  for (let i = 0; i < items.length; i++) {
    stdout.write(formatRow(items[i] as SelectItem<T>, i === cursor) + "\n");
  }
}

function redraw<T extends string>(items: ReadonlyArray<SelectItem<T>>, cursor: number): void {
  // Move back to the first list row and rewrite each line.
  stdout.write(ansi.moveUp(items.length));
  for (let i = 0; i < items.length; i++) {
    stdout.write(ansi.clearLine + formatRow(items[i] as SelectItem<T>, i === cursor) + "\n");
  }
}

/**
 * After a commit/abort: replace the multi-line list with a single summary
 * line so the scrollback stays tidy. Returns cursor to a fresh line.
 */
function finishWithList<T extends string>(
  items: ReadonlyArray<SelectItem<T>>,
  cursor: number,
  outcome: "commit" | "abort",
  picked?: SelectItem<T>,
): void {
  stdout.write(ansi.moveUp(items.length));
  for (let i = 0; i < items.length; i++) {
    stdout.write(ansi.clearLine + (i === items.length - 1 ? "" : "\n"));
  }
  // Replace the last cleared row with a summary.
  stdout.write(ansi.clearLine);
  if (outcome === "commit" && picked) {
    stdout.write(`  ${paint.green("\u2713")} ${paint.bold(picked.label)}\n`);
  } else {
    stdout.write(`  ${paint.red("\u2717")} ${paint.dim("cancelled")}\n`);
  }
  void cursor;
}

function formatRow<T extends string>(item: SelectItem<T>, selected: boolean): string {
  const pointer = selected ? paint.cyan("\u276F") : " ";
  const label = selected ? paint.bold(item.label) : item.label;
  const hint = item.hint ? paint.dim(`  ${item.hint}`) : "";
  return ` ${pointer} ${label}${hint}`;
}
