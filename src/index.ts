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
      `[FOGCLAW REDACTED] ${plan.redacted.length} entity(ies) prepared for ${config.redactStrategy} redaction (${labels}).`,
    );
  }

  return contextParts;
}

/**
 * OpenClaw plugin definition.
 *
 * Registers:
 * - `before_agent_start` hook for automatic PII guardrail
 * - `fogclaw_scan` tool for on-demand entity detection
 * - `fogclaw_preview` tool for dry-run policy simulation
 * - `fogclaw_redact` tool for on-demand redaction
 */
const fogclaw = {
  id: "fogclaw",
  name: "FogClaw",

  register(api: any) {
    const rawConfig = api.pluginConfig ?? api.getConfig?.() ?? {};
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

    // --- HOOK: Guardrail on incoming messages ---
    api.on("before_agent_start", async (event: any) => {
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
        contextParts.push(
          `[FOGCLAW REDACTED] The following is the user's message with PII redacted:\n${redactedResult.redacted_text}`,
        );
      }

      if (contextParts.length > 0) {
        return { prependContext: contextParts.join("\n\n") };
      }
    });

    // --- HOOK: Scan tool results for PII before persistence ---
    const toolResultRegex = new RegexEngine();
    const toolResultHandler = createToolResultHandler(config, toolResultRegex, api.logger, redactionMapStore);
    api.on("tool_result_persist", toolResultHandler);

    // --- HOOK: Scan outbound messages for PII before delivery ---
    const messageSendingHandler = createMessageSendingHandler(config, scanner, api.logger, redactionMapStore);
    api.on("message_sending", messageSendingHandler);

    // --- TOOL: On-demand scan ---
    api.registerTool(
      {
        name: "fogclaw_scan",
        id: "fogclaw_scan",
        description:
          "Scan text for PII and custom entities. Returns detected entities with types, positions, and confidence scores.",
        parameters: {
          type: "object",
          properties: {
            text: {
              type: "string",
              description: "Text to scan for entities",
            },
            custom_labels: {
              type: "array",
              items: { type: "string" },
              description:
                "Additional entity labels for zero-shot detection (e.g., ['competitor name', 'project codename'])",
            },
          },
          required: ["text"],
        },
        execute: async (
          _toolCallId: string,
          params: { text: string; custom_labels?: string[] },
        ) => {
          const { text, custom_labels } = params;
          const result = await scanner.scan(text, custom_labels);
          return {
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
        id: "fogclaw_preview",
        description:
          "Preview which entities will be blocked, warned, or redacted and the redacted message, without changing runtime behavior.",
        parameters: {
          type: "object",
          properties: {
            text: {
              type: "string",
              description: "Text to run through FogClaw policy preview",
            },
            strategy: {
              type: "string",
              description:
                'Override redaction strategy for the preview: "token" ([EMAIL_1]), "mask" (****), or "hash" ([EMAIL_a1b2c3...]).',
              enum: ["token", "mask", "hash"],
            },
            custom_labels: {
              type: "array",
              items: { type: "string" },
              description: "Additional entity labels for zero-shot detection",
            },
          },
          required: ["text"],
        },
        execute: async (
          _toolCallId: string,
          params: {
            text: string;
            strategy?: "token" | "mask" | "hash";
            custom_labels?: string[];
          },
        ) => {
          const { text, strategy, custom_labels } = params;
          const result = await scanner.scan(text, custom_labels);
          const plan = buildGuardrailPlan(result.entities, config);
          const summary = planToSummary(plan);
          const redacted = redact(
            text,
            plan.redacted,
            strategy ?? config.redactStrategy,
          );

          return {
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
                    mapping: redacted.mapping,
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
        id: "fogclaw_redact",
        description:
          "Scan and redact PII/custom entities from text. Returns sanitized text with entities replaced.",
        parameters: {
          type: "object",
          properties: {
            text: {
              type: "string",
              description: "Text to scan and redact",
            },
            strategy: {
              type: "string",
              description:
                'Redaction strategy: "token" ([EMAIL_1]), "mask" (****), or "hash" ([EMAIL_a1b2c3...])',
              enum: ["token", "mask", "hash"],
            },
            custom_labels: {
              type: "array",
              items: { type: "string" },
              description: "Additional entity labels for zero-shot detection",
            },
          },
          required: ["text"],
        },
        execute: async (
          _toolCallId: string,
          params: {
            text: string;
            strategy?: "token" | "mask" | "hash";
            custom_labels?: string[];
          },
        ) => {
          const { text, strategy, custom_labels } = params;
          const result = await scanner.scan(text, custom_labels);
          const redacted = redact(
            text,
            result.entities,
            strategy ?? config.redactStrategy,
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    redacted_text: redacted.redacted_text,
                    entities_found: result.entities.length,
                    mapping: redacted.mapping,
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
    api.registerTool({
      name: "fogclaw_request_access",
      id: "fogclaw_request_access",
      description:
        "Request access to redacted PII data. Use when you encounter a redacted placeholder (like [EMAIL_1]) and need the original text to complete a task. A user must review and approve the request.",
      parameters: {
        type: "object",
        properties: {
          placeholder: {
            type: "string",
            description:
              'The redacted placeholder token (e.g., "[EMAIL_1]", "[SSN_1]")',
          },
          entity_type: {
            type: "string",
            description:
              'The type of entity (e.g., "EMAIL", "SSN", "PERSON")',
          },
          reason: {
            type: "string",
            description: "Why you need access to this data",
          },
          context: {
            type: "string",
            description:
              "Surrounding text or context where the placeholder appears (optional)",
          },
        },
        required: ["placeholder", "entity_type", "reason"],
      },
      execute: createRequestAccessHandler(backlogStore, config, api.logger),
    });

    // --- TOOL: List access requests ---
    api.registerTool({
      name: "fogclaw_requests",
      id: "fogclaw_requests",
      description:
        "List PII access requests. Use to review pending requests or check for approved/denied responses. Filter by status: pending, approved, denied, follow_up.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description:
              'Filter by request status. One of: "pending", "approved", "denied", "follow_up". Omit to list all.',
            enum: ["pending", "approved", "denied", "follow_up"],
          },
        },
        required: [],
      },
      execute: createRequestsListHandler(backlogStore, config, api.logger),
    });

    // --- TOOL: Resolve access request ---
    api.registerTool({
      name: "fogclaw_resolve",
      id: "fogclaw_resolve",
      description:
        'Resolve a PII access request. Approve to reveal the original text, deny to reject, or follow_up to ask the agent for more context. Use request_id for single or request_ids for batch.',
      parameters: {
        type: "object",
        properties: {
          request_id: {
            type: "string",
            description: 'The ID of the request to resolve (e.g., "REQ-1")',
          },
          request_ids: {
            type: "array",
            items: { type: "string" },
            description:
              "Multiple request IDs to resolve with the same action (batch mode)",
          },
          action: {
            type: "string",
            description:
              'Action to take: "approve" (reveal original text), "deny" (reject), or "follow_up" (ask agent for more context)',
            enum: ["approve", "deny", "follow_up"],
          },
          message: {
            type: "string",
            description:
              "Optional message: reason for denial, or follow-up question for the agent",
          },
        },
        required: ["action"],
      },
      execute: createResolveHandler(backlogStore, config, api.logger),
    });

    api.logger?.info(
      `[fogclaw] Plugin registered — guardrail: ${config.guardrail_mode}, model: ${config.model}, custom entities: ${config.custom_entities.length}, audit: ${config.auditEnabled}`,
    );
  },
};

export default fogclaw;
