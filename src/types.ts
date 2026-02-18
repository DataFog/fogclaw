export interface Entity {
  text: string;
  label: string;
  start: number;
  end: number;
  confidence: number;
  source: "regex" | "gliner";
}

export type RedactStrategy = "token" | "mask" | "hash";

export type GuardrailAction = "redact" | "block" | "warn";

export interface EntityConfidenceThresholds {
  [entityType: string]: number;
}

export interface EntityAllowlist {
  values: string[];
  patterns: string[];
  entities: Record<string, string[]>;
}

export interface FogClawConfig {
  enabled: boolean;
  guardrail_mode: GuardrailAction;
  redactStrategy: RedactStrategy;
  model: string;
  confidence_threshold: number;
  custom_entities: string[];
  entityActions: Record<string, GuardrailAction>;
  entityConfidenceThresholds: EntityConfidenceThresholds;
  allowlist: EntityAllowlist;
  auditEnabled: boolean;
  maxPendingRequests: number;
}

export interface ScanResult {
  entities: Entity[];
  text: string;
}

export interface RedactResult {
  redacted_text: string;
  mapping: Record<string, string>;
  entities: Entity[];
}

export interface GuardrailPlan {
  blocked: Entity[];
  warned: Entity[];
  redacted: Entity[];
}

export const CANONICAL_TYPE_MAP: Record<string, string> = {
  DOB: "DATE",
  ZIP: "ZIP_CODE",
  PER: "PERSON",
  ORG: "ORGANIZATION",
  GPE: "LOCATION",
  LOC: "LOCATION",
  FAC: "ADDRESS",
  PHONE_NUMBER: "PHONE",
  SOCIAL_SECURITY_NUMBER: "SSN",
  CREDIT_CARD_NUMBER: "CREDIT_CARD",
  DATE_OF_BIRTH: "DATE",
};

export function canonicalType(entityType: string): string {
  const normalized = entityType.toUpperCase().trim();
  return CANONICAL_TYPE_MAP[normalized] ?? normalized;
}

export function resolveAction(entity: Entity, config: FogClawConfig): GuardrailAction {
  return config.entityActions[entity.label] ?? config.guardrail_mode;
}

// --- Access Request Backlog types ---

export type RequestStatus = "pending" | "approved" | "denied" | "follow_up";

export interface AccessRequest {
  id: string;
  placeholder: string;
  entityType: string;
  originalText: string | null;
  reason: string;
  context: string | null;
  status: RequestStatus;
  createdAt: string;
  resolvedAt: string | null;
  followUpMessage: string | null;
  responseMessage: string | null;
}
