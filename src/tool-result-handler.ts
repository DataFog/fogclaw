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
import { canonicalType } from "./types.js";
import type { Entity, FogClawConfig, GuardrailAction } from "./types.js";

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
 * Build an allowlist filter from config. Replicates Scanner.filterByPolicy
 * and Scanner.shouldAllowlistEntity logic synchronously.
 */
function buildAllowlistFilter(config: FogClawConfig): (entity: Entity) => boolean {
  const globalValues = new Set(
    config.allowlist.values.map((v) => v.trim().toLowerCase()),
  );

  const globalPatterns = config.allowlist.patterns
    .filter((p) => p.length > 0)
    .map((p) => new RegExp(p, "i"));

  const entityValues = new Map<string, Set<string>>();
  for (const [entityType, values] of Object.entries(config.allowlist.entities)) {
    const canonical = canonicalType(entityType);
    const set = new Set(
      values
        .map((v) => v.trim().toLowerCase())
        .filter((v) => v.length > 0),
    );
    entityValues.set(canonical, set);
  }

  // Return true if entity should be KEPT (not allowlisted)
  return (entity: Entity): boolean => {
    const normalizedText = entity.text.trim().toLowerCase();

    if (globalValues.has(normalizedText)) return false;
    if (globalPatterns.some((pattern) => pattern.test(entity.text))) return false;

    const perEntity = entityValues.get(entity.label);
    if (perEntity && perEntity.has(normalizedText)) return false;

    return true;
  };
}

function resolveAction(entity: Entity, config: FogClawConfig): GuardrailAction {
  return config.entityActions[entity.label] ?? config.guardrail_mode;
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
): (event: ToolResultPersistEvent, ctx: ToolResultPersistContext) => { message: unknown } | void {
  const shouldKeep = buildAllowlistFilter(config);

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
