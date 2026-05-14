import type { ZodTypeAny, infer as Infer } from "zod";

import { AgentError } from "../../util/errors.js";

/**
 * Parse the JSON object out of a raw model response and validate it
 * against the supplied Zod schema. Tolerant of code fences, leading
 * prose, or trailing commentary — picks the first balanced JSON
 * object substring.
 */
export function parseJsonWithSchema<S extends ZodTypeAny>(
  raw: string,
  schema: S,
  stageLabel: string,
): Infer<S> {
  const body = stripCodeFence(raw) ?? raw;
  const json = extractFirstObject(body);
  if (!json) {
    throw new AgentError("MODEL_BAD_OUTPUT", `${stageLabel}: model did not return a JSON object.`, {
      preview: body.slice(0, 400),
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e: unknown) {
    throw new AgentError(
      "MODEL_BAD_JSON",
      `${stageLabel}: model output was not valid JSON: ${(e as Error).message}`,
      { preview: json.slice(0, 400) },
    );
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new AgentError(
      "MODEL_SCHEMA_MISMATCH",
      `${stageLabel}: model output did not match the expected schema.`,
      { issues: result.error.issues, preview: json.slice(0, 400) },
    );
  }
  return result.data;
}

function stripCodeFence(text: string): string | null {
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/;
  const m = fenceRe.exec(text);
  return m && m[1] ? m[1] : null;
}

function extractFirstObject(text: string): string | null {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") { if (depth === 0) start = i; depth++; }
    else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) return text.slice(start, i + 1);
    }
  }
  return null;
}
