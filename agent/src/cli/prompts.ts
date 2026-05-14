import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline";
import type { ReadLine } from "node:readline";

import {
  interactiveSelect,
  isInteractiveSelectSupported,
  SelectCancelled,
} from "./interactive-select.js";
import type { LiveRegion } from "./live-region.js";
import { paint } from "./render.js";

/**
 * Small wrapper around `readline` that gives us text / secret / choice
 * prompts. Intended for use only in interactive (TTY) mode.
 *
 * NOTE on "secret": we deliberately DO NOT mask. Masked input via raw mode
 * breaks paste in many terminals (especially anything that wraps pastes in
 * bracketed-paste escape sequences). API keys end up in plaintext at
 * `~/.pr-agent/config.toml` anyway, so the masking-during-prompt step is
 * mostly theatre. We use plain readline input which paste works in
 * universally and lets the user verify what they pasted.
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

  /**
   * Paste-friendly prompt for secrets. Visible (not masked) by design - see
   * the class-level note. Use {@link text} when you want a default value.
   */
  async secret(label: string, opts: { required?: boolean } = {}): Promise<string> {
    const required = opts.required ?? true;
    while (true) {
      const answer = (await this.ask(`${label}: `)).trim();
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
    opts: { defaultId?: T; region?: LiveRegion; header?: string } = {},
  ): Promise<T> {
    if (choices.length === 0) {
      throw new Error("Prompter.choice: at least one choice is required");
    }

    if (isInteractiveSelectSupported()) {
      this.rl.pause();
      try {
        const selectOpts: Parameters<typeof interactiveSelect<T>>[0] = {
          label,
          items: choices,
        };
        if (opts.defaultId !== undefined) selectOpts.defaultId = opts.defaultId;
        if (opts.region !== undefined) selectOpts.region = opts.region;
        if (opts.header !== undefined) selectOpts.header = opts.header;
        return await interactiveSelect<T>(selectOpts);
      } catch (err: unknown) {
        if (err instanceof SelectCancelled) {
          process.exit(130);
        }
        throw err;
      } finally {
        this.rl.resume();
      }
    }

    return this.numericChoice(label, choices, opts);
  }

  private async numericChoice<T extends string>(
    label: string,
    choices: ReadonlyArray<{ id: T; label: string; hint?: string }>,
    opts: { defaultId?: T },
  ): Promise<T> {
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
}
