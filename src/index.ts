import { Scanner } from "./scanner.js";
import { redact } from "./redactor.js";
import { loadConfig } from "./config.js";
import type { FogClawConfig, GuardrailAction } from "./types.js";

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
 * OpenClaw plugin registration.
 *
 * Registers:
 * - `before_agent_start` hook for automatic PII guardrail
 * - `fogclaw_scan` tool for on-demand entity detection
 * - `fogclaw_redact` tool for on-demand redaction
 */
export async function register(api: any) {
  const rawConfig = api.getConfig?.() ?? {};
  const config = loadConfig(rawConfig);

  if (!config.enabled) {
    console.log("[fogclaw] Plugin disabled via config");
    return;
  }

  const scanner = new Scanner(config);
  await scanner.initialize();

  // --- HOOK: Guardrail on incoming messages ---
  api.registerHook("before_agent_start", async (context: any) => {
    const result = await scanner.scan(context.message);

    if (result.entities.length === 0) return;

    // Check for any "block" actions
    for (const entity of result.entities) {
      const action: GuardrailAction =
        config.entityActions[entity.label] ?? config.guardrail_mode;

      if (action === "block") {
        return api.reply(
          `Message blocked: detected ${entity.label}. Please rephrase without sensitive information.`,
        );
      }
    }

    // Check for any "warn" actions
    const warnings = result.entities.filter((e) => {
      const action = config.entityActions[e.label] ?? config.guardrail_mode;
      return action === "warn";
    });
    if (warnings.length > 0) {
      const types = [...new Set(warnings.map((w) => w.label))].join(", ");
      api.notify?.(`PII detected: ${types}`);
    }

    // Apply redaction for "redact" action entities
    const toRedact = result.entities.filter((e) => {
      const action = config.entityActions[e.label] ?? config.guardrail_mode;
      return action === "redact";
    });
    if (toRedact.length > 0) {
      const redacted = redact(context.message, toRedact, config.redactStrategy);
      context.message = redacted.redacted_text;
    }
  });

  // --- TOOL: On-demand scan ---
  api.registerTool({
    id: "fogclaw_scan",
    name: "Scan for PII",
    description:
      "Scan text for PII and custom entities. Returns detected entities with types, positions, and confidence scores.",
    parameters: {
      text: {
        type: "string",
        description: "Text to scan for entities",
        required: true,
      },
      custom_labels: {
        type: "array",
        description:
          "Additional entity labels for zero-shot detection (e.g., ['competitor name', 'project codename'])",
        required: false,
      },
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
        entities: result.entities,
        count: result.entities.length,
        summary: result.entities.length > 0
          ? `Found ${result.entities.length} entities: ${[...new Set(result.entities.map((e) => e.label))].join(", ")}`
          : "No entities detected",
      };
    },
  });

  // --- TOOL: On-demand redact ---
  api.registerTool({
    id: "fogclaw_redact",
    name: "Redact PII",
    description:
      "Scan and redact PII/custom entities from text. Returns sanitized text with entities replaced.",
    parameters: {
      text: {
        type: "string",
        description: "Text to scan and redact",
        required: true,
      },
      strategy: {
        type: "string",
        description:
          'Redaction strategy: "token" ([EMAIL_1]), "mask" (****), or "hash" ([EMAIL_a1b2c3...])',
        enum: ["token", "mask", "hash"],
        required: false,
      },
      custom_labels: {
        type: "array",
        description: "Additional entity labels for zero-shot detection",
        required: false,
      },
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
        redacted_text: redacted.redacted_text,
        entities_found: result.entities.length,
        mapping: redacted.mapping,
      };
    },
  });

  console.log(
    `[fogclaw] Plugin registered — guardrail: ${config.guardrail_mode}, model: ${config.model}, custom entities: ${config.custom_entities.length}`,
  );
}
