import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline";
import type { ReadLine } from "node:readline";

import { paint } from "./render.js";

/**
 * Small wrapper around `readline` that gives us text / secret / choice
 * prompts. Intended for use only in interactive (TTY) mode.
 */
export class Prompter {
  private readonly rl: ReadLine;

  constructor() {
    this.rl = createInterface({ input: stdin, output: stdout, terminal: true });
  }

  close(): void {
    this.rl.close();
  }

  async text(label: string, opts: { default?: string; required?: boolean } = {}): Promise<string> {
    const suffix = opts.default ? paint.dim(` [${opts.default}]`) : "";
    const required = opts.required ?? !opts.default;
    while (true) {
      const answer = (await this.ask(`${label}${suffix}: `)).trim();
      if (answer.length > 0) return answer;
      if (opts.default !== undefined) return opts.default;
      if (!required) return "";
      stdout.write(paint.warn("  Please enter a value.\n"));
    }
  }

  async secret(label: string, opts: { required?: boolean } = {}): Promise<string> {
    const required = opts.required ?? true;
    while (true) {
      const answer = (await this.askMasked(`${label}: `)).trim();
      if (answer.length > 0) return answer;
      if (!required) return "";
      stdout.write(paint.warn("  Please enter a value.\n"));
    }
  }

  async confirm(label: string, defaultYes = true): Promise<boolean> {
    const hint = defaultYes ? "Y/n" : "y/N";
    const answer = (await this.ask(`${label} (${hint}): `)).trim().toLowerCase();
    if (answer === "") return defaultYes;
    return answer === "y" || answer === "yes";
  }

  async choice<T extends string>(
    label: string,
    choices: ReadonlyArray<{ id: T; label: string; hint?: string }>,
    opts: { defaultId?: T } = {},
  ): Promise<T> {
    if (choices.length === 0) {
      throw new Error("Prompter.choice: at least one choice is required");
    }
    stdout.write(`${label}\n`);
    choices.forEach((c, i) => {
      const num = paint.dim(`  ${i + 1})`);
      const hint = c.hint ? paint.dim(`  - ${c.hint}`) : "";
      stdout.write(`${num} ${c.label}${hint}\n`);
    });
    const defaultIdx = opts.defaultId
      ? choices.findIndex((c) => c.id === opts.defaultId) + 1
      : 1;
    const suffix = paint.dim(` [${defaultIdx}]`);
    while (true) {
      const raw = (await this.ask(`Choose 1-${choices.length}${suffix}: `)).trim();
      const picked = raw === "" ? defaultIdx : Number.parseInt(raw, 10);
      if (Number.isInteger(picked) && picked >= 1 && picked <= choices.length) {
        const choice = choices[picked - 1];
        if (choice) return choice.id;
      }
      stdout.write(paint.warn(`  Please enter a number between 1 and ${choices.length}.\n`));
    }
  }

  private ask(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(prompt, (answer) => resolve(answer));
    });
  }

  /**
   * Prompts without echoing the typed characters back to the terminal.
   * Falls back to plain `ask()` if stdin isn't a TTY (e.g. piped input).
   */
  private askMasked(prompt: string): Promise<string> {
    if (!stdin.isTTY) {
      return this.ask(prompt);
    }
    return new Promise((resolve) => {
      stdout.write(prompt);
      const chars: string[] = [];
      const wasRaw = stdin.isRaw;
      stdin.setRawMode(true);
      stdin.resume();

      const onData = (data: Buffer): void => {
        const str = data.toString("utf8");
        for (const ch of str) {
          if (ch === "\u0003") {
            cleanup();
            stdout.write("\n");
            process.exit(130);
            return;
          }
          if (ch === "\r" || ch === "\n") {
            cleanup();
            stdout.write("\n");
            resolve(chars.join(""));
            return;
          }
          if (ch === "\u007f" || ch === "\b") {
            if (chars.length > 0) {
              chars.pop();
              stdout.write("\b \b");
            }
            continue;
          }
          chars.push(ch);
          stdout.write("*");
        }
      };

      const cleanup = (): void => {
        stdin.removeListener("data", onData);
        stdin.setRawMode(wasRaw);
        stdin.pause();
      };

      stdin.on("data", onData);
    });
  }
}
