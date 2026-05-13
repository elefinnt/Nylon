import { reviewOutputSchema, type ReviewOutput } from "./types.js";
import { AgentError } from "../util/errors.js";

/**
 * Models sometimes wrap JSON in ```json fences or include a stray prose
 * sentence before the object. We tolerate both by extracting the first
 * balanced JSON object substring before validating.
 */
export function extractReviewJson(raw: string): ReviewOutput {
  const fenced = stripCodeFence(raw);
  const body = fenced ?? raw;
  const json = extractFirstObject(body);
  if (!json) {
    throw new AgentError("MODEL_BAD_OUTPUT", "Model did not return a JSON object.", {
      preview: body.slice(0, 400),
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e: unknown) {
    throw new AgentError("MODEL_BAD_JSON", `Model output was not valid JSON: ${(e as Error).message}`, {
      preview: json.slice(0, 400),
    });
  }
  const result = reviewOutputSchema.safeParse(parsed);
  if (!result.success) {
    throw new AgentError("MODEL_SCHEMA_MISMATCH", "Model output did not match the review schema.", {
      issues: result.error.issues,
    });
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
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}
