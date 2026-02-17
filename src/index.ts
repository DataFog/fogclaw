import { Scanner } from "./scanner.js";
import { redact } from "./redactor.js";
import { loadConfig } from "./config.js";
import type { GuardrailAction } from "./types.js";

export { Scanner } from "./scanner.js";
export { redact } from "./redactor.js";
export { loadConfig, DEFAULT_CONFIG } from "./config.js";
export type {
  Entity,
  FogClawConfig,
  ScanResult,
  RedactResult,
  RedactStrategy,
  GuardrailAction,
} from "./types.js";

/**
 * OpenClaw plugin definition.
 *
 * Registers:
 * - `before_agent_start` hook for automatic PII guardrail
 * - `fogclaw_scan` tool for on-demand entity detection
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

    // --- HOOK: Guardrail on incoming messages ---
    api.on("before_agent_start", async (event: any) => {
      const message = event.prompt ?? "";
      if (!message) return;

      const result = await scanner.scan(message);

      if (result.entities.length === 0) return;

      // Classify entities by their configured action
      const blocked: typeof result.entities = [];
      const warned: typeof result.entities = [];
      const toRedact: typeof result.entities = [];

      for (const entity of result.entities) {
        const action: GuardrailAction =
          config.entityActions[entity.label] ?? config.guardrail_mode;
        if (action === "block") blocked.push(entity);
        else if (action === "warn") warned.push(entity);
        else if (action === "redact") toRedact.push(entity);
      }

      const contextParts: string[] = [];

      // "block" — inject a strong instruction to refuse
      if (blocked.length > 0) {
        const types = [...new Set(blocked.map((e) => e.label))].join(", ");
        contextParts.push(
          `[FOGCLAW GUARDRAIL — BLOCKED] The user's message contains sensitive information (${types}). ` +
          `Do NOT process or repeat this information. Ask the user to rephrase without sensitive data.`,
        );
      }

      // "warn" — inject a warning notice
      if (warned.length > 0) {
        const types = [...new Set(warned.map((e) => e.label))].join(", ");
        contextParts.push(
          `[FOGCLAW NOTICE] PII detected in user message: ${types}. Handle with care.`,
        );
      }

      // "redact" — replace PII with tokens
      if (toRedact.length > 0) {
        const redacted = redact(message, toRedact, config.redactStrategy);
        contextParts.push(
          `[FOGCLAW REDACTED] The following is the user's message with PII redacted:\n${redacted.redacted_text}`,
        );
      }

      if (contextParts.length > 0) {
        return { prependContext: contextParts.join("\n\n") };
      }
    });

    // --- TOOL: On-demand scan ---
    api.registerTool({
      id: "fogclaw_scan",
      description:
        "Scan text for PII and custom entities. Returns detected entities with types, positions, and confidence scores.",
      schema: {
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
      handler: async ({
        text,
        custom_labels,
      }: {
        text: string;
        custom_labels?: string[];
      }) => {
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
                      ? `Found ${result.entities.length} entities: ${[...new Set(result.entities.map((e) => e.label))].join(", ")}`
                      : "No entities detected",
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    });

    // --- TOOL: On-demand redact ---
    api.registerTool({
      id: "fogclaw_redact",
      description:
        "Scan and redact PII/custom entities from text. Returns sanitized text with entities replaced.",
      schema: {
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
      handler: async ({
        text,
        strategy,
        custom_labels,
      }: {
        text: string;
        strategy?: "token" | "mask" | "hash";
        custom_labels?: string[];
      }) => {
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
    });

    api.logger?.info(
      `[fogclaw] Plugin registered — guardrail: ${config.guardrail_mode}, model: ${config.model}, custom entities: ${config.custom_entities.length}`,
    );
  },
};

export default fogclaw;
