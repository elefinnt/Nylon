import { version as pkgVersion } from "../version.js";
import type { Request } from "../protocol.js";
import { writeEvent } from "../protocol.js";
import { listRegisteredProviders } from "../providers/registry.js";
import { writeTemplateConfig } from "../config.js";
import { runReview } from "./orchestrator.js";
import { toAgentError } from "../util/errors.js";
import { logger } from "../util/log.js";

export async function dispatch(request: Request): Promise<void> {
  try {
    switch (request.type) {
      case "ping":
        writeEvent({ type: "pong", version: pkgVersion });
        return;
      case "listProviders": {
        const providers = listRegisteredProviders();
        writeEvent({ type: "providers", providers });
        return;
      }
      case "init": {
        const path = await writeTemplateConfig(request.path);
        writeEvent({ type: "result", ok: true, path });
        return;
      }
      case "review": {
        await runReview(request);
        return;
      }
      case "cancel": {
        writeEvent({ type: "result", ok: true, message: "Nothing to cancel." });
        return;
      }
      default: {
        const exhaustive: never = request;
        void exhaustive;
        return;
      }
    }
  } catch (err: unknown) {
    const e = toAgentError(err);
    logger.error({ err: e, code: e.code }, "Request failed");
    writeEvent({ type: "error", code: e.code, message: e.message, details: e.details });
  }
}
