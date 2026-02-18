import type { Entity, FogClawConfig } from "./types.js";
import { canonicalType } from "./types.js";
import { RegexEngine } from "./engines/regex.js";
import { GlinerEngine } from "./engines/gliner.js";

type AllowlistPatternCache = {
  values: Set<string>;
  patterns: RegExp[];
  entityValues: Map<string, Set<string>>;
};

function normalizeAllowlistValue(value: string): string {
  return value.trim().toLowerCase();
}

function buildPatternMaps(value: string[] | undefined): RegExp[] {
  if (!value || value.length === 0) {
    return [];
  }

  return value.map((pattern) => new RegExp(pattern, "i"));
}

export class Scanner {
  private regexEngine: RegexEngine;
  private glinerEngine: GlinerEngine;
  private glinerAvailable = false;
  private config: FogClawConfig;
  private allowlist: AllowlistPatternCache;

  constructor(config: FogClawConfig) {
    this.config = config;
    this.regexEngine = new RegexEngine();

    const glinerThreshold = this.computeGlinerThreshold(config);
    this.glinerEngine = new GlinerEngine(config.model, glinerThreshold);
    if (config.custom_entities.length > 0) {
      this.glinerEngine.setCustomLabels(config.custom_entities);
    }

    this.allowlist = this.buildAllowlistCache(config.allowlist);
  }

  async initialize(): Promise<void> {
    try {
      await this.glinerEngine.initialize();
      this.glinerAvailable = true;
    } catch (err) {
      console.warn(
        `[fogclaw] GLiNER failed to initialize, falling back to regex-only mode: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.glinerAvailable = false;
    }
  }

  async scan(text: string, extraLabels?: string[]): Promise<{ entities: Entity[]; text: string }> {
    if (!text) return { entities: [], text };

    // Step 1: Regex pass (always runs, synchronous)
    const regexEntities = this.filterByPolicy(this.regexEngine.scan(text));

    // Step 2: GLiNER pass (if available)
    let glinerEntities: Entity[] = [];
    if (this.glinerAvailable) {
      try {
        glinerEntities = await this.glinerEngine.scan(text, extraLabels);
        glinerEntities = this.filterByConfidence(glinerEntities);
        glinerEntities = this.filterByPolicy(glinerEntities);
      } catch (err) {
        console.warn(
          `[fogclaw] GLiNER scan failed, using regex results only: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    // Step 3: Merge and deduplicate
    const merged = deduplicateEntities([...regexEntities, ...glinerEntities]);

    return { entities: merged, text };
  }

  private filterByConfidence(entities: Entity[]): Entity[] {
    return entities.filter((entity) => {
      const threshold = this.getThresholdForLabel(entity.label);
      return entity.confidence >= threshold;
    });
  }

  private filterByPolicy(entities: Entity[]): Entity[] {
    if (
      this.allowlist.values.size === 0 &&
      this.allowlist.patterns.length === 0 &&
      this.allowlist.entityValues.size === 0
    ) {
      return entities;
    }

    return entities.filter((entity) => !this.shouldAllowlistEntity(entity));
  }

  private shouldAllowlistEntity(entity: Entity): boolean {
    const normalizedText = normalizeAllowlistValue(entity.text);

    if (this.allowlist.values.has(normalizedText)) {
      return true;
    }

    if (this.allowlist.patterns.some((pattern) => pattern.test(entity.text))) {
      return true;
    }

    const entityValues = this.allowlist.entityValues.get(entity.label);
    if (entityValues && entityValues.has(normalizedText)) {
      return true;
    }

    return false;
  }

  private getThresholdForLabel(label: string): number {
    const canonicalLabel = canonicalType(label);
    return this.config.entityConfidenceThresholds[canonicalLabel] ?? this.config.confidence_threshold;
  }

  private computeGlinerThreshold(config: FogClawConfig): number {
    const thresholds = Object.values(config.entityConfidenceThresholds);
    if (thresholds.length === 0) {
      return config.confidence_threshold;
    }

    return Math.min(config.confidence_threshold, ...thresholds);
  }

  private buildAllowlistCache(allowlist: FogClawConfig["allowlist"]): AllowlistPatternCache {
    const globalValues = new Set(
      allowlist.values.map((value) => normalizeAllowlistValue(value)),
    );

    const globalPatterns = buildPatternMaps(allowlist.patterns);

    const entityValues = new Map<string, Set<string>>();
    for (const [entityType, values] of Object.entries(allowlist.entities)) {
      const canonical = canonicalType(entityType);
      const uniqueValues = values
        .map((value) => normalizeAllowlistValue(value))
        .filter((value) => value.length > 0);
      entityValues.set(canonical, new Set(uniqueValues));
    }

    return {
      values: globalValues,
      patterns: globalPatterns,
      entityValues,
    };
  }

  get isGlinerAvailable(): boolean {
    return this.glinerAvailable;
  }
}

/**
 * Remove overlapping entity spans. When two entities overlap,
 * keep the one with higher confidence. If equal, prefer regex.
 */
function deduplicateEntities(entities: Entity[]): Entity[] {
  if (entities.length <= 1) return entities;

  // Sort by start position, then by confidence descending
  const sorted = [...entities].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.confidence - a.confidence;
  });

  const result: Entity[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = result[result.length - 1];

    // Check for overlap
    if (current.start < last.end) {
      // Overlapping: keep higher confidence (already in result if first)
      if (current.confidence > last.confidence) {
        result[result.length - 1] = current;
      }
      // Otherwise keep what's already in result
    } else {
      result.push(current);
    }
  }

  return result;
}
