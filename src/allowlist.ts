/**
 * Shared allowlist matching for all FogClaw scanning paths.
 *
 * Matching semantics (a security boundary — deliberately strict):
 * - Exact values match the full entity text, case-insensitively, after
 *   trimming.
 * - Patterns must match the FULL entity text; a partial match never
 *   suppresses a finding.
 * - Entities longer than MAX_PATTERN_SUBJECT_LENGTH skip pattern matching
 *   fail-safe: the finding is kept, never suppressed.
 *
 * Allowlist entries are operator configuration; never accept them from
 * end users. Pattern safety (length cap, nested-quantifier rejection) is
 * enforced at config load in config.ts.
 */
import { canonicalType } from "./types.js";
import { MAX_PATTERN_SUBJECT_LENGTH } from "./config.js";
import type { Entity, EntityAllowlist } from "./types.js";

/** Returns true when the entity is allowlisted and should be suppressed. */
export type AllowlistMatcher = (entity: Entity) => boolean;

function normalizeValue(value: string): string {
  return value.trim().toLowerCase();
}

export function buildAllowlistMatcher(allowlist: EntityAllowlist): AllowlistMatcher {
  const values = new Set(allowlist.values.map(normalizeValue));

  // Anchor so patterns must match the FULL entity text (mirrors
  // datafog-python 4.7.0 fullmatch semantics).
  const patterns = allowlist.patterns
    .filter((pattern) => pattern.length > 0)
    .map((pattern) => new RegExp(`^(?:${pattern})$`, "i"));

  const entityValues = new Map<string, Set<string>>();
  for (const [entityType, entries] of Object.entries(allowlist.entities)) {
    const normalized = entries.map(normalizeValue).filter((value) => value.length > 0);
    entityValues.set(canonicalType(entityType), new Set(normalized));
  }

  if (values.size === 0 && patterns.length === 0 && entityValues.size === 0) {
    return () => false;
  }

  return (entity: Entity): boolean => {
    const normalizedText = normalizeValue(entity.text);

    if (values.has(normalizedText)) return true;

    if (
      entity.text.length <= MAX_PATTERN_SUBJECT_LENGTH &&
      patterns.some((pattern) => pattern.test(entity.text))
    ) {
      return true;
    }

    const perEntity = entityValues.get(entity.label);
    return perEntity ? perEntity.has(normalizedText) : false;
  };
}
