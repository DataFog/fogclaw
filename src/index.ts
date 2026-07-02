import { Type } from "typebox";
import {
  definePluginEntry,
  type OpenClawPluginApi,
  type OpenClawPluginDefinition,
} from "openclaw/plugin-sdk/plugin-entry";
import type {
  PluginHookToolResultPersistEvent,
  PluginHookToolResultPersistContext,
  PluginHookToolResultPersistResult,
} from "openclaw/plugin-sdk/types";

import { Scanner } from "./scanner.js";
import { redact } from "./redactor.js";
import { loadConfig } from "./config.js";
import { RegexEngine } from "./engines/regex.js";
import { createToolResultHandler } from "./tool-result-handler.js";
import { createMessageSendingHandler } from "./message-sending-handler.js";
import { RedactionMapStore, BacklogStore } from "./backlog.js";
import {
  createRequestAccessHandler,
  createRequestsListHandler,
  createResolveHandler,
} from "./backlog-tools.js";
import { resolveAction } from "./types.js";
import type {
  Entity,
  FogClawConfig,
  GuardrailAction,
  RedactResult,
  RedactStrategy,
  ScanResult,
  AccessRequest,
  RequestStatus,
} from "./types.js";

export { Scanner } from "./scanner.js";
export { redact } from "./redactor.js";
export { loadConfig, DEFAULT_CONFIG } from "./config.js";
export { RedactionMapStore, BacklogStore } from "./backlog.js";
export type {
  Entity,
  FogClawConfig,
  ScanResult,
  RedactResult,
  RedactStrategy,
  GuardrailAction,
  AccessRequest,
  RequestStatus,
} from "./types.js";

function buildGuardrailPlan(entities: Entity[], config: FogClawConfig) {
  const blocked: Entity[] = [];
  const warned: Entity[] = [];
  const redacted: Entity[] = [];

  for (const entity of entities) {
    const action = resolveAction(entity, config);
    if (action === "block") blocked.push(entity);
    else if (action === "warn") warned.push(entity);
    else redacted.push(entity);
  }

  return { blocked, warned, redacted };
}

function planToSummary(plan: ReturnType<typeof buildGuardrailPlan>): {
  total: number;
  blocked: number;
  warned: number;
  redacted: number;
  labels: {
    blocked: string[];
    warned: string[];
    redacted: string[];
  };
} {
  return {
    total: plan.blocked.length + plan.warned.length + plan.redacted.length,
    blocked: plan.blocked.length,
    warned: plan.warned.length,
    redacted: plan.redacted.length,
    labels: {
      blocked: [...new Set(plan.blocked.map((entity) => entity.label))],
      warned: [...new Set(plan.warned.map((entity) => entity.label))],
      redacted: [...new Set(plan.redacted.map((entity) => entity.label))],
    },
  };
}

function buildGuardrailContext(plan: ReturnType<typeof buildGuardrailPlan>, config: FogClawConfig): string[] {
  const contextParts: string[] = [];

  if (plan.blocked.length > 0) {
    const types = [...new Set(plan.blocked.map((entity) => entity.label))].join(", ");
    contextParts.push(
      `[FOGCLAW GUARDRAIL — BLOCKED] The user's message contains sensitive information (${types}). ` +
        `Do NOT process or repeat this information. Ask the user to rephrase without sensitive data.`,
    );
  }

  if (plan.warned.length > 0) {
    const types = [...new Set(plan.warned.map((entity) => entity.label))].join(", ");
    contextParts.push(
      `[FOGCLAW NOTICE] PII detected in user message: ${types}. Handle with care.`,
    );
  }

  if (plan.redacted.length > 0) {
    const labels = [...new Set(plan.redacted.map((entity) => entity.label))].join(", ");
    contextParts.push(
      `[FOGCLAW NOTICE] The user's message contains sensitive data (${labels}). ` +
        `Do not repeat these values in replies, tool calls, or outbound messages — ` +
        `refer to them by placeholder instead. FogClaw enforces redaction on tool ` +
        `results and outbound delivery.`,
    );
  }

  return contextParts;
}

/**
 * OpenClaw plugin definition.
 *
 * Registers:
 * - `before_prompt_build` hook for automatic PII guardrail (redact/warn, plus
 *   block-instruction fallback when the run gate is unavailable)
 * - `before_agent_run` gate for hard blocking, when block actions are
 *   configured (requires `hooks.allowConversationAccess: true`)
 * - `tool_result_persist` / `message_sending` / `reply_payload_sending`
 *   hooks for tool-result and outbound redaction
 * - `fogclaw_scan` tool for on-demand entity detection
 * - `fogclaw_preview` tool for dry-run policy simulation
 * - `fogclaw_redact` tool for on-demand redaction
 */
const fogclaw: OpenClawPluginDefinition = definePluginEntry({
  id: "fogclaw",
  name: "FogClaw",
  description: "PII detection & custom entity redaction plugin powered by DataFog",

  register(api: OpenClawPluginApi) {
    const rawConfig = api.pluginConfig ?? {};
    const config = loadConfig(rawConfig);

    if (!config.enabled) {
      api.logger?.info("[fogclaw] Plugin disabled via config");
      return;
    }

    const scanner = new Scanner(config);
    // Initialize GLiNER in the background — regex works immediately,
    // GLiNER becomes available once the model loads.
    scanner.initialize().catch((err: unknown) => {
      api.logger?.warn(`[fogclaw] GLiNER background init failed: ${String(err)}`);
    });

    // --- Access Request Backlog ---
    const redactionMapStore = new RedactionMapStore();
    const backlogStore = new BacklogStore(redactionMapStore, config.maxPendingRequests);

    // --- HOOK: Hard block gate (only when block actions are configured) ---
    // before_agent_run can stop the run outright, unlike the prompt-level
    // block instruction. It is a conversation-access hook: users must set
    // plugins.entries.fogclaw.hooks.allowConversationAccess: true. If
    // registration is rejected, the before_prompt_build block instruction
    // below still applies as a soft fallback.
    const blockConfigured =
      config.guardrail_mode === "block" ||
      Object.values(config.entityActions).includes("block");
    if (blockConfigured) {
      try {
        api.on("before_agent_run", async (event) => {
          const message = event.prompt ?? "";
          if (!message) return { outcome: "pass" };

          const result: ScanResult = await scanner.scan(message);
          const plan = buildGuardrailPlan(result.entities, config);
          if (plan.blocked.length === 0) return { outcome: "pass" };

          const labels = [...new Set(plan.blocked.map((entity) => entity.label))];
          if (config.auditEnabled) {
            api.logger?.info(
              `[FOGCLAW AUDIT] run_blocked ${JSON.stringify({
                blocked: plan.blocked.length,
                blockedLabels: labels,
              })}`,
            );
          }

          return {
            outcome: "block",
            reason: `blocked entity types detected: ${labels.join(", ")}`,
            message: `Message blocked: it contains sensitive information (${labels.join(", ")}). Rephrase without sensitive data.`,
            category: "pii",
          };
        });
      } catch (err) {
        api.logger?.warn(
          `[fogclaw] before_agent_run gate unavailable (set plugins.entries.fogclaw.hooks.allowConversationAccess: true for hard blocking); falling back to prompt-level block instruction: ${String(err)}`,
        );
      }
    }

    // --- HOOK: Guardrail on incoming messages ---
    api.on("before_prompt_build", async (event) => {
      const message = event.prompt ?? "";
      if (!message) return;

      const result: ScanResult = await scanner.scan(message);
      if (result.entities.length === 0) return;

      const plan = buildGuardrailPlan(result.entities, config);
      const contextParts = buildGuardrailContext(plan, config);

      if (config.auditEnabled) {
        const summary = planToSummary(plan);
        api.logger?.info(
          `[FOGCLAW AUDIT] guardrail_scan ${JSON.stringify({
            totalEntities: summary.total,
            blocked: summary.blocked,
            warned: summary.warned,
            redacted: summary.redacted,
            blockedLabels: summary.labels.blocked,
            warnedLabels: summary.labels.warned,
            redactedLabels: summary.labels.redacted,
          })}`,
        );
      }

      if (plan.redacted.length > 0) {
        const redactedResult: RedactResult = redact(
          message,
          plan.redacted,
          config.redactStrategy,
        );
        redactionMapStore.addMapping(redactedResult.mapping);
        // The plugin API cannot rewrite the inbound prompt (prependContext
        // only adds to it), so the original text still reaches the model.
        // Give it the placeholder reference to use instead of claiming the
        // message was redacted; enforcement happens on the tool-result and
        // outbound paths, and via the before_agent_run gate in block mode.
        contextParts.push(
          `[FOGCLAW] Placeholder reference for the sensitive values (use these instead of the originals):\n${redactedResult.redacted_text}`,
        );
      }

      if (contextParts.length > 0) {
        return { prependContext: contextParts.join("\n\n") };
      }
    });

    // --- HOOK: Scan tool results for PII before persistence ---
    const toolResultRegex = new RegexEngine();
    const toolResultHandler = createToolResultHandler(config, toolResultRegex, api.logger, redactionMapStore);
    api.on(
      "tool_result_persist",
      (
        event: PluginHookToolResultPersistEvent,
        ctx: PluginHookToolResultPersistContext,
      ): PluginHookToolResultPersistResult | void => {
        const result = toolResultHandler(event, ctx);
        if (!result) return;
        // replaceText preserves the incoming message shape, so this cast is
        // faithful to what the hook received.
        return { message: result.message as PluginHookToolResultPersistEvent["message"] };
      },
    );

    // --- HOOK: Scan outbound messages for PII before delivery ---
    const messageSendingHandler = createMessageSendingHandler(config, scanner, api.logger, redactionMapStore);
    api.on("message_sending", messageSendingHandler);

    // --- HOOK: Scan normalized reply payloads (media captions and payload
    // text do not always flow through message_sending) ---
    api.on("reply_payload_sending", (event) => {
      const text = event.payload?.text;
      if (!text) return;

      const result = scanner.scanRegexOnly(text);
      if (result.entities.length === 0) return;

      const redacted: RedactResult = redact(text, result.entities, config.redactStrategy);
      redactionMapStore.addMapping(redacted.mapping);

      if (config.auditEnabled) {
        api.logger?.info(
          `[FOGCLAW AUDIT] reply_payload_redacted ${JSON.stringify({
            entities: result.entities.length,
            labels: [...new Set(result.entities.map((entity) => entity.label))],
          })}`,
        );
      }

      return { payload: { ...event.payload, text: redacted.redacted_text } };
    });

    // --- TOOL: On-demand scan ---
    api.registerTool(
      {
        name: "fogclaw_scan",
        label: "FogClaw Scan",
        description:
          "Scan text for PII and custom entities. Returns detected entities with types, positions, and confidence scores.",
        parameters: Type.Object({
          text: Type.String({ description: "Text to scan for entities" }),
          custom_labels: Type.Optional(
            Type.Array(Type.String(), {
              description:
                "Additional entity labels for zero-shot detection (e.g., ['competitor name', 'project codename'])",
            }),
          ),
        }),
        execute: async (_toolCallId: string, params: unknown) => {
          const { text, custom_labels } = params as {
            text: string;
            custom_labels?: string[];
          };
          const result = await scanner.scan(text, custom_labels);
          return {
            details: undefined,
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    entities: result.entities,
                    count: result.entities.length,
                    summary:
                      result.entities.length > 0
                        ? `Found ${result.entities.length} entities: ${[...new Set(result.entities.map((entity) => entity.label))].join(", ")}`
                        : "No entities detected",
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        },
      }
    );

    // --- TOOL: Policy preview ---
    api.registerTool(
      {
        name: "fogclaw_preview",
        label: "FogClaw Preview",
        description:
          "Preview which entities will be blocked, warned, or redacted and the redacted message, without changing runtime behavior.",
        parameters: Type.Object({
          text: Type.String({ description: "Text to run through FogClaw policy preview" }),
          strategy: Type.Optional(
            Type.Union(
              [Type.Literal("token"), Type.Literal("mask"), Type.Literal("hash")],
              {
                description:
                  'Override redaction strategy for the preview: "token" ([EMAIL_1]), "mask" (****), or "hash" ([EMAIL_a1b2c3...]).',
              },
            ),
          ),
          custom_labels: Type.Optional(
            Type.Array(Type.String(), {
              description: "Additional entity labels for zero-shot detection",
            }),
          ),
        }),
        execute: async (_toolCallId: string, params: unknown) => {
          const { text, strategy, custom_labels } = params as {
            text: string;
            strategy?: "token" | "mask" | "hash";
            custom_labels?: string[];
          };
          const result = await scanner.scan(text, custom_labels);
          const plan = buildGuardrailPlan(result.entities, config);
          const summary = planToSummary(plan);
          const redacted = redact(
            text,
            plan.redacted,
            strategy ?? config.redactStrategy,
          );

          return {
            details: undefined,
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    entities: result.entities,
                    totalEntities: summary.total,
                    actionPlan: {
                      blocked: {
                        count: summary.blocked,
                        labels: summary.labels.blocked,
                      },
                      warned: {
                        count: summary.warned,
                        labels: summary.labels.warned,
                      },
                      redacted: {
                        count: summary.redacted,
                        labels: summary.labels.redacted,
                      },
                    },
                    redactedText: redacted.redacted_text,
                    redactionStrategy: strategy ?? config.redactStrategy,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        },
      }
    );

    // --- TOOL: On-demand redact ---
    api.registerTool(
      {
        name: "fogclaw_redact",
        label: "FogClaw Redact",
        description:
          "Scan and redact PII/custom entities from text. Returns sanitized text with entities replaced. Original values are never returned; to recover a specific placeholder, use fogclaw_request_access (a user must approve).",
        parameters: Type.Object({
          text: Type.String({ description: "Text to scan and redact" }),
          strategy: Type.Optional(
            Type.Union(
              [Type.Literal("token"), Type.Literal("mask"), Type.Literal("hash")],
              {
                description:
                  'Redaction strategy: "token" ([EMAIL_1]), "mask" (****), or "hash" ([EMAIL_a1b2c3...])',
              },
            ),
          ),
          custom_labels: Type.Optional(
            Type.Array(Type.String(), {
              description: "Additional entity labels for zero-shot detection",
            }),
          ),
        }),
        execute: async (_toolCallId: string, params: unknown) => {
          const { text, strategy, custom_labels } = params as {
            text: string;
            strategy?: "token" | "mask" | "hash";
            custom_labels?: string[];
          };
          const result = await scanner.scan(text, custom_labels);
          const redacted = redact(
            text,
            result.entities,
            strategy ?? config.redactStrategy,
          );
          // The mapping never goes back to the model — reveals go through
          // the access-request backlog (user approval).
          redactionMapStore.addMapping(redacted.mapping);
          return {
            details: undefined,
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    redacted_text: redacted.redacted_text,
                    entities_found: result.entities.length,
                    placeholders: Object.keys(redacted.mapping),
                    note: "Original values are not returned. Use fogclaw_request_access with a placeholder to request user-approved access.",
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        },
      }
    );

    // --- TOOL: Request access to redacted data ---
    const requestAccessHandler = createRequestAccessHandler(backlogStore, config, api.logger);
    api.registerTool({
      name: "fogclaw_request_access",
      label: "FogClaw Request Access",
      description:
        "Request access to redacted PII data. Use when you encounter a redacted placeholder (like [EMAIL_1]) and need the original text to complete a task. A user must review and approve the request.",
      parameters: Type.Object({
        placeholder: Type.String({
          description: 'The redacted placeholder token (e.g., "[EMAIL_1]", "[SSN_1]")',
        }),
        entity_type: Type.String({
          description: 'The type of entity (e.g., "EMAIL", "SSN", "PERSON")',
        }),
        reason: Type.String({ description: "Why you need access to this data" }),
        context: Type.Optional(
          Type.String({
            description: "Surrounding text or context where the placeholder appears (optional)",
          }),
        ),
      }),
      execute: async (toolCallId, params) => ({
        details: undefined,
        ...requestAccessHandler(
          toolCallId,
          params as {
            placeholder: string;
            entity_type: string;
            reason: string;
            context?: string;
          },
        ),
      }),
    });

    // --- TOOL: List access requests ---
    const requestsListHandler = createRequestsListHandler(backlogStore, config, api.logger);
    api.registerTool({
      name: "fogclaw_requests",
      label: "FogClaw Requests",
      description:
        "List PII access requests. Use to review pending requests or check for approved/denied responses. Filter by status: pending, approved, denied, follow_up.",
      parameters: Type.Object({
        status: Type.Optional(
          Type.Union(
            [
              Type.Literal("pending"),
              Type.Literal("approved"),
              Type.Literal("denied"),
              Type.Literal("follow_up"),
            ],
            {
              description:
                'Filter by request status. One of: "pending", "approved", "denied", "follow_up". Omit to list all.',
            },
          ),
        ),
      }),
      execute: async (toolCallId, params) => ({
        details: undefined,
        ...requestsListHandler(toolCallId, params as { status?: string }),
      }),
    });

    // --- TOOL: Resolve access request ---
    const resolveHandler = createResolveHandler(backlogStore, config, api.logger);
    api.registerTool({
      name: "fogclaw_resolve",
      label: "FogClaw Resolve",
      description:
        'Resolve a PII access request. Approve to reveal the original text, deny to reject, or follow_up to ask the agent for more context. Use request_id for single or request_ids for batch.',
      parameters: Type.Object({
        request_id: Type.Optional(
          Type.String({ description: 'The ID of the request to resolve (e.g., "REQ-1")' }),
        ),
        request_ids: Type.Optional(
          Type.Array(Type.String(), {
            description: "Multiple request IDs to resolve with the same action (batch mode)",
          }),
        ),
        action: Type.Union(
          [Type.Literal("approve"), Type.Literal("deny"), Type.Literal("follow_up")],
          {
            description:
              'Action to take: "approve" (reveal original text), "deny" (reject), or "follow_up" (ask agent for more context)',
          },
        ),
        message: Type.Optional(
          Type.String({
            description: "Optional message: reason for denial, or follow-up question for the agent",
          }),
        ),
      }),
      execute: async (toolCallId, params) => ({
        details: undefined,
        ...resolveHandler(
          toolCallId,
          params as {
            request_id?: string;
            request_ids?: string[];
            action: string;
            message?: string;
          },
        ),
      }),
    });

    api.logger?.info(
      `[fogclaw] Plugin registered — guardrail: ${config.guardrail_mode}, model: ${config.model}, custom entities: ${config.custom_entities.length}, audit: ${config.auditEnabled}`,
    );
  },
});

export default fogclaw;
