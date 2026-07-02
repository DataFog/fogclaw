/**
 * Synchronous tool_result_persist hook handler for FogClaw.
 *
 * Scans tool result text for PII using the regex engine (synchronous),
 * redacts detected entities, and returns the transformed message.
 * GLiNER is not used here because tool_result_persist is synchronous-only.
 */

import { RegexEngine } from "./engines/regex.js";
import { redact } from "./redactor.js";
import { extractText, replaceText } from "./extract.js";
import { resolveAction } from "./types.js";
import { buildAllowlistMatcher } from "./allowlist.js";
import type { FogClawConfig } from "./types.js";
import type { RedactionMapStore } from "./backlog.js";

interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
}

export interface ToolResultPersistEvent {
  toolName?: string;
  toolCallId?: string;
  message: unknown;
  isSynthetic?: boolean;
}

export interface ToolResultPersistContext {
  agentId?: string;
  sessionKey?: string;
  toolName?: string;
  toolCallId?: string;
}

/**
 * Create a synchronous tool_result_persist hook handler.
 *
 * The returned function must NOT return a Promise — OpenClaw rejects
 * async tool_result_persist handlers.
 */
export function createToolResultHandler(
  config: FogClawConfig,
  regexEngine: RegexEngine,
  logger?: Logger,
  redactionMapStore?: RedactionMapStore,
): (event: ToolResultPersistEvent, ctx: ToolResultPersistContext) => { message: unknown } | void {
  const isAllowlisted = buildAllowlistMatcher(config.allowlist);
  const shouldKeep = (entity: Parameters<typeof isAllowlisted>[0]): boolean =>
    !isAllowlisted(entity);

  return (event: ToolResultPersistEvent, _ctx: ToolResultPersistContext): { message: unknown } | void => {
    const text = extractText(event.message);
    if (!text) return;

    // Scan with regex engine (synchronous)
    let entities = regexEngine.scan(text);
    if (entities.length === 0) return;

    // Apply allowlist filtering
    entities = entities.filter(shouldKeep);
    if (entities.length === 0) return;

    // All guardrail modes produce span-level redaction in tool results.
    // Determine which entities are actionable (all of them — block/warn/redact
    // all produce redaction at the tool result level).
    const actionableEntities = entities.filter((entity) => {
      const action = resolveAction(entity, config);
      return action === "redact" || action === "block" || action === "warn";
    });

    if (actionableEntities.length === 0) return;

    // Redact
    const result = redact(text, actionableEntities, config.redactStrategy);

    // Capture mapping for backlog access requests
    if (redactionMapStore) {
      redactionMapStore.addMapping(result.mapping);
    }

    // Replace text in the message
    const modifiedMessage = replaceText(event.message, result.redacted_text);

    // Audit logging
    if (config.auditEnabled && logger) {
      const labels = [...new Set(actionableEntities.map((e) => e.label))];
      logger.info(
        `[FOGCLAW AUDIT] tool_result_scan ${JSON.stringify({
          totalEntities: actionableEntities.length,
          labels,
          toolName: event.toolName ?? null,
          source: "tool_result",
        })}`,
      );
    }

    return { message: modifiedMessage };
  };
}
