import { AnthropicProvider } from "./anthropic.js";
import { CursorProvider } from "./cursor.js";
import { OpenAiProvider } from "./openai.js";
import type { AiProvider } from "./types.js";

const builtIns: readonly AiProvider[] = [
  new CursorProvider(),
  new AnthropicProvider(),
  new OpenAiProvider(),
];

const byId = new Map<string, AiProvider>(builtIns.map((p) => [p.id, p]));

export function getProvider(id: string): AiProvider {
  const p = byId.get(id);
  if (!p) {
    throw new Error(`Unknown provider id: ${id}. Known: ${[...byId.keys()].join(", ")}`);
  }
  return p;
}

export function listRegisteredProviders(): Array<{
  id: string;
  displayName: string;
  models: Array<{ id: string; displayName: string }>;
}> {
  return [...byId.values()].map((p) => ({
    id: p.id,
    displayName: p.displayName,
    models: p.models.map((m) => ({ id: m.id, displayName: m.displayName })),
  }));
}
