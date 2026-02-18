import { describe, it, expect } from "vitest";

import { loadConfig } from "../src/config.js";

describe("FogClaw config", () => {
  it("loads defaults for new policy fields", () => {
    const config = loadConfig({});

    expect(config.entityConfidenceThresholds).toEqual({});
    expect(config.allowlist).toMatchObject({
      values: [],
      patterns: [],
      entities: {},
    });
  });

  it("canonicalizes per-entity confidence threshold keys", () => {
    const config = loadConfig({
      entityConfidenceThresholds: {
        person: 0.7,
      },
    });

    expect(config.entityConfidenceThresholds).toEqual({
      PERSON: 0.7,
    });
  });

  it("rejects invalid per-entity confidence thresholds", () => {
    expect(() =>
      loadConfig({
        entityConfidenceThresholds: {
          PERSON: 1.2,
        },
      }),
    ).toThrow('entityConfidenceThresholds["PERSON"] must be between 0 and 1, got 1.2');
  });

  it("validates allowlist regex patterns", () => {
    expect(() =>
      loadConfig({
        allowlist: {
          values: ["ok@example.com"],
          patterns: ["["],
          entities: {
            PERSON: ["John"],
          },
        },
      }),
    ).toThrow(/invalid regex pattern/);
  });

  it("canonicalizes allowlist entity keys", () => {
    const config = loadConfig({
      allowlist: {
        entities: {
          person: ["John"],
        },
      },
    });

    expect(config.allowlist.entities).toEqual({
      PERSON: ["John"],
    });
  });

  it("canonicalizes entity action labels", () => {
    const config = loadConfig({
      entityActions: {
        person: "block",
      },
    });

    expect(config.entityActions).toEqual({
      PERSON: "block",
    });
  });
});
