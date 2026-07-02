import type { Entity, FogClawConfig } from "./types.js";
import { canonicalType } from "./types.js";
import { buildAllowlistMatcher, type AllowlistMatcher } from "./allowlist.js";
import { RegexEngine } from "./engines/regex.js";
import { GlinerEngine } from "./engines/gliner.js";

export class Scanner {
  private regexEngine: RegexEngine;
  private glinerEngine: GlinerEngine;
  private glinerAvailable = false;
  private config: FogClawConfig;
  private isAllowlisted: AllowlistMatcher;

  constructor(config: FogClawConfig) {
    this.config = config;
    this.regexEngine = new RegexEngine();

    const glinerThreshold = this.computeGlinerThreshold(config);
    this.glinerEngine = new GlinerEngine(config.model, glinerThreshold);
    if (config.custom_entities.length > 0) {
      this.glinerEngine.setCustomLabels(config.custom_entities);
    }

    this.isAllowlisted = buildAllowlistMatcher(config.allowlist);
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

  scanRegexOnly(text: string): { entities: Entity[]; text: string } {
    if (!text) return { entities: [], text };

    const entities = deduplicateEntities(this.filterByPolicy(this.regexEngine.scan(text)));
    return { entities, text };
  }

  private filterByConfidence(entities: Entity[]): Entity[] {
    return entities.filter((entity) => {
      const threshold = this.getThresholdForLabel(entity.label);
      return entity.confidence >= threshold;
    });
  }

  private filterByPolicy(entities: Entity[]): Entity[] {
    return entities.filter((entity) => !this.isAllowlisted(entity));
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
