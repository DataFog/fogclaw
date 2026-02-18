import {
  canonicalType,
  type EntityAllowlist,
  type FogClawConfig,
  type GuardrailAction,
  type RedactStrategy,
} from "./types.js";

const VALID_GUARDRAIL_MODES: GuardrailAction[] = ["redact", "block", "warn"];
const VALID_REDACT_STRATEGIES: RedactStrategy[] = ["token", "mask", "hash"];

function ensureStringList(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array of strings`);
  }

  const entries = value.filter((entry): entry is string => {
    if (typeof entry !== "string") {
      throw new Error(`${path} must contain only strings`);
    }

    return true;
  });

  return entries.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

function ensureEntityAllowlist(value: unknown): EntityAllowlist {
  if (value == null) {
    return { values: [], patterns: [], entities: {} };
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("allowlist must be an object");
  }

  const raw = value as Record<string, unknown>;
  const values = ensureStringList(raw.values ?? [], "allowlist.values");
  const patterns = ensureStringList(raw.patterns ?? [], "allowlist.patterns");

  for (const pattern of patterns) {
    try {
      new RegExp(pattern);
    } catch {
      throw new Error(`allowlist.patterns contains invalid regex pattern: "${pattern}"`);
    }
  }

  const entitiesValue = raw.entities ?? {};
  if (
    typeof entitiesValue !== "object" ||
    Array.isArray(entitiesValue) ||
    entitiesValue === null
  ) {
    throw new Error("allowlist.entities must be an object mapping entity labels to string arrays");
  }

  const entities: Record<string, string[]> = {};
  for (const [entityType, entryValue] of Object.entries(entitiesValue)) {
    const normalizedType = canonicalType(entityType);
    entities[normalizedType] = ensureStringList(entryValue, `allowlist.entities.${entityType}`);
  }

  return {
    values: [...new Set(values)],
    patterns: [...new Set(patterns)],
    entities,
  };
}

function ensureEntityConfidenceThresholds(
  value: unknown,
): Record<string, number> {
  if (!value) {
    return {};
  }

  if (typeof value !== "object" || Array.isArray(value) || value === null) {
    throw new Error("entityConfidenceThresholds must be an object");
  }

  const raw = value as Record<string, unknown>;
  const normalized: Record<string, number> = {};

  for (const [entityType, rawThreshold] of Object.entries(raw)) {
    if (typeof rawThreshold !== "number" || Number.isNaN(rawThreshold)) {
      throw new Error(
        `entityConfidenceThresholds["${entityType}"] must be a number between 0 and 1, got ${String(
          rawThreshold,
        )}`,
      );
    }

    if (rawThreshold < 0 || rawThreshold > 1) {
      throw new Error(
        `entityConfidenceThresholds["${entityType}"] must be between 0 and 1, got ${rawThreshold}`,
      );
    }

    const canonicalTypeKey = canonicalType(entityType);
    normalized[canonicalTypeKey] = rawThreshold;
  }

  return normalized;
}

export const DEFAULT_CONFIG: FogClawConfig = {
  enabled: true,
  guardrail_mode: "redact",
  redactStrategy: "token",
  model: "onnx-community/gliner_large-v2.1",
  confidence_threshold: 0.5,
  custom_entities: [],
  entityActions: {},
  entityConfidenceThresholds: {},
  allowlist: {
    values: [],
    patterns: [],
    entities: {},
  },
  auditEnabled: true,
  maxPendingRequests: 50,
};

export function loadConfig(overrides: Partial<FogClawConfig>): FogClawConfig {
  const config: FogClawConfig = {
    ...DEFAULT_CONFIG,
    ...overrides,
    entityActions: {
      ...DEFAULT_CONFIG.entityActions,
      ...(overrides.entityActions ?? {}),
    },
    entityConfidenceThresholds: {
      ...DEFAULT_CONFIG.entityConfidenceThresholds,
      ...(overrides.entityConfidenceThresholds ?? {}),
    },
  };

  config.allowlist = ensureEntityAllowlist(overrides.allowlist ?? DEFAULT_CONFIG.allowlist);
  config.entityConfidenceThresholds = ensureEntityConfidenceThresholds(
    config.entityConfidenceThresholds,
  );

  if (typeof config.enabled !== "boolean") {
    throw new Error(`enabled must be true or false`);
  }

  if (!VALID_GUARDRAIL_MODES.includes(config.guardrail_mode)) {
    throw new Error(
      `Invalid guardrail_mode "${config.guardrail_mode}". Must be one of: ${VALID_GUARDRAIL_MODES.join(", ")}`,
    );
  }

  if (!VALID_REDACT_STRATEGIES.includes(config.redactStrategy)) {
    throw new Error(
      `Invalid redactStrategy "${config.redactStrategy}". Must be one of: ${VALID_REDACT_STRATEGIES.join(", ")}`,
    );
  }

  if (config.confidence_threshold < 0 || config.confidence_threshold > 1) {
    throw new Error(
      `confidence_threshold must be between 0 and 1, got ${config.confidence_threshold}`,
    );
  }

  if (typeof config.auditEnabled !== "boolean") {
    throw new Error(`auditEnabled must be true or false`);
  }

  if (
    typeof config.maxPendingRequests !== "number" ||
    !Number.isInteger(config.maxPendingRequests) ||
    config.maxPendingRequests < 1
  ) {
    throw new Error(
      `maxPendingRequests must be a positive integer, got ${String(config.maxPendingRequests)}`,
    );
  }

  const normalizedActions: Record<string, GuardrailAction> = {};
  for (const [entityType, action] of Object.entries(config.entityActions)) {
    if (!VALID_GUARDRAIL_MODES.includes(action)) {
      throw new Error(
        `Invalid action "${action}" for entity type "${entityType}". Must be one of: ${VALID_GUARDRAIL_MODES.join(", ")}`,
      );
    }

    const normalizedType = canonicalType(entityType);
    normalizedActions[normalizedType] = action;
  }
  config.entityActions = normalizedActions;

  return config;
}
