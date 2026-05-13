export class AgentError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "AgentError";
    this.code = code;
    this.details = details;
  }
}

export function toAgentError(err: unknown): AgentError {
  if (err instanceof AgentError) return err;
  if (err instanceof Error) return new AgentError("INTERNAL", err.message);
  return new AgentError("INTERNAL", String(err));
}
