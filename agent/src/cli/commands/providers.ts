import { stdout } from "node:process";

import { listRegisteredProviders } from "../../providers/registry.js";
import { paint } from "../render.js";

export function runProvidersCommand(): number {
  const providers = listRegisteredProviders();
  if (providers.length === 0) {
    stdout.write("(no providers registered)\n");
    return 0;
  }
  for (const p of providers) {
    stdout.write(`${paint.bold(p.id)}  ${paint.dim(p.displayName)}\n`);
    for (const m of p.models) {
      stdout.write(`  ${paint.cyan("•")} ${m.id}  ${paint.dim(m.displayName)}\n`);
    }
  }
  return 0;
}
