/**
 * Async message_sending hook handler for FogClaw.
 *
 * Scans outbound message text for PII using the full Scanner
 * (regex + GLiNER), redacts detected entities, and returns
 * modified content. Never cancels message delivery.
 *
 * Note: message_sending is defined in OpenClaw but not yet invoked
 * upstream. This handler activates automatically when wired.
 */

import type { Scanner } from "./scanner.js";
import { redact } from "./redactor.js";
import { resolveAction } from "./types.js";
import type { Entity, FogClawConfig } from "./types.js";
import type { RedactionMapStore } from "./backlog.js";

interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
}

export interface MessageSendingEvent {
  to: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface MessageSendingContext {
  channelId: string;
  accountId?: string;
  conversationId?: string;
}

export interface MessageSendingResult {
  content?: string;
  cancel?: boolean;
}

/**
 * Create an async message_sending hook handler.
 *
 * Uses the full Scanner (regex + GLiNER) since this hook supports
 * async handlers. All guardrail modes produce span-level redaction;
 * cancel is never returned.
 */
export function createMessageSendingHandler(
  config: FogClawConfig,
  scanner: Scanner,
  logger?: Logger,
  redactionMapStore?: RedactionMapStore,
): (event: MessageSendingEvent, ctx: MessageSendingContext) => Promise<MessageSendingResult | void> {
  return async (
    event: MessageSendingEvent,
    _ctx: MessageSendingContext,
  ): Promise<MessageSendingResult | void> => {
    const text = event.content;
    if (!text) return;

    const result = await scanner.scan(text);
    if (result.entities.length === 0) return;

    // All modes produce span-level redaction for outbound messages.
    const actionableEntities = result.entities.filter((entity) => {
      const action = resolveAction(entity, config);
      return action === "redact" || action === "block" || action === "warn";
    });

    if (actionableEntities.length === 0) return;

    const redacted = redact(text, actionableEntities, config.redactStrategy);

    // Capture mapping for backlog access requests
    if (redactionMapStore) {
      redactionMapStore.addMapping(redacted.mapping);
    }

    // Audit logging
    if (config.auditEnabled && logger) {
      const labels = [...new Set(actionableEntities.map((e) => e.label))];
      logger.info(
        `[FOGCLAW AUDIT] outbound_scan ${JSON.stringify({
          totalEntities: actionableEntities.length,
          labels,
          channelId: _ctx.channelId ?? null,
          source: "outbound",
        })}`,
      );
    }

    // Never cancel — always deliver the redacted version.
    return { content: redacted.redacted_text };
  };
}
