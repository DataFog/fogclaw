import { describe, it, expect, vi } from "vitest";
import { createToolResultHandler } from "../src/tool-result-handler.js";
import { RegexEngine } from "../src/engines/regex.js";
import type { FogClawConfig } from "../src/types.js";

function makeConfig(overrides: Partial<FogClawConfig> = {}): FogClawConfig {
  return {
    enabled: true,
    guardrail_mode: "redact",
    redactStrategy: "token",
    model: "test",
    confidence_threshold: 0.5,
    custom_entities: [],
    entityActions: {},
    entityConfidenceThresholds: {},
    allowlist: { values: [], patterns: [], entities: {} },
    auditEnabled: false,
    ...overrides,
  };
}

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
  };
}

describe("createToolResultHandler", () => {
  const regexEngine = new RegexEngine();

  it("returns a synchronous function (not async)", () => {
    const handler = createToolResultHandler(makeConfig(), regexEngine);
    expect(typeof handler).toBe("function");

    // Verify it does not return a Promise
    const result = handler(
      { message: "no pii here" },
      {},
    );
    // undefined is expected for no-PII — not a Promise
    expect(result).toBeUndefined();
  });

  it("redacts SSN in a plain string message", () => {
    const handler = createToolResultHandler(makeConfig(), regexEngine);
    const result = handler(
      { message: "SSN is 123-45-6789" },
      {},
    );
    expect(result).toBeDefined();
    expect(result!.message).toBe("SSN is [SSN_1]");
  });

  it("redacts email in a content-string message", () => {
    const handler = createToolResultHandler(makeConfig(), regexEngine);
    const result = handler(
      { message: { role: "toolResult", content: "Contact john@example.com" } },
      {},
    );
    expect(result).toBeDefined();
    const msg = result!.message as Record<string, unknown>;
    expect(msg.content).toBe("Contact [EMAIL_1]");
    expect(msg.role).toBe("toolResult");
  });

  it("redacts phone number in content block array", () => {
    const handler = createToolResultHandler(makeConfig(), regexEngine);
    const result = handler(
      {
        message: {
          content: [{ type: "text", text: "Call 555-123-4567 please" }],
        },
      },
      {},
    );
    expect(result).toBeDefined();
    const msg = result!.message as Record<string, unknown>;
    const content = msg.content as Array<Record<string, unknown>>;
    expect(content[0].text).toBe("Call [PHONE_1] please");
  });

  it("redacts multiple PII types in one message", () => {
    const handler = createToolResultHandler(makeConfig(), regexEngine);
    const result = handler(
      { message: "Call 555-123-4567 or email john@example.com" },
      {},
    );
    expect(result).toBeDefined();
    const text = result!.message as string;
    expect(text).toContain("[PHONE_1]");
    expect(text).toContain("[EMAIL_1]");
    expect(text).not.toContain("555-123-4567");
    expect(text).not.toContain("john@example.com");
  });

  it("returns void when no PII is found", () => {
    const handler = createToolResultHandler(makeConfig(), regexEngine);
    const result = handler(
      { message: "This is clean text with no sensitive data." },
      {},
    );
    expect(result).toBeUndefined();
  });

  it("returns void for empty string message", () => {
    const handler = createToolResultHandler(makeConfig(), regexEngine);
    expect(handler({ message: "" }, {})).toBeUndefined();
  });

  it("returns void for null message", () => {
    const handler = createToolResultHandler(makeConfig(), regexEngine);
    expect(handler({ message: null }, {})).toBeUndefined();
  });

  it("returns void for message with no extractable text", () => {
    const handler = createToolResultHandler(makeConfig(), regexEngine);
    expect(
      handler(
        {
          message: {
            content: [{ type: "image", source: { data: "base64" } }],
          },
        },
        {},
      ),
    ).toBeUndefined();
  });

  it("respects allowlist — global values", () => {
    const config = makeConfig({
      allowlist: {
        values: ["noreply@example.com"],
        patterns: [],
        entities: {},
      },
    });
    const handler = createToolResultHandler(config, regexEngine);
    const result = handler(
      { message: "Contact noreply@example.com for help" },
      {},
    );
    // The allowlisted email should not be redacted
    expect(result).toBeUndefined();
  });

  it("respects allowlist — global patterns", () => {
    const config = makeConfig({
      allowlist: {
        values: [],
        patterns: ["^internal-"],
        entities: {},
      },
    });
    const handler = createToolResultHandler(config, regexEngine);
    const result = handler(
      { message: "Contact internal-noreply@company.com" },
      {},
    );
    expect(result).toBeUndefined();
  });

  it("respects allowlist — per-entity values", () => {
    const config = makeConfig({
      allowlist: {
        values: [],
        patterns: [],
        entities: { EMAIL: ["public@example.com"] },
      },
    });
    const handler = createToolResultHandler(config, regexEngine);
    const result = handler(
      { message: "Email public@example.com or secret@example.com" },
      {},
    );
    expect(result).toBeDefined();
    const text = result!.message as string;
    // public@example.com should be preserved, secret@example.com should be redacted
    expect(text).toContain("public@example.com");
    expect(text).not.toContain("secret@example.com");
    expect(text).toContain("[EMAIL_1]");
  });

  it("uses mask redaction strategy", () => {
    const config = makeConfig({ redactStrategy: "mask" });
    const handler = createToolResultHandler(config, regexEngine);
    const result = handler(
      { message: "SSN is 123-45-6789" },
      {},
    );
    expect(result).toBeDefined();
    const text = result!.message as string;
    expect(text).toContain("***********");
    expect(text).not.toContain("123-45-6789");
  });

  it("uses hash redaction strategy", () => {
    const config = makeConfig({ redactStrategy: "hash" });
    const handler = createToolResultHandler(config, regexEngine);
    const result = handler(
      { message: "SSN is 123-45-6789" },
      {},
    );
    expect(result).toBeDefined();
    const text = result!.message as string;
    expect(text).toMatch(/\[SSN_[a-f0-9]{12}\]/);
    expect(text).not.toContain("123-45-6789");
  });

  it("applies entityActions config — all modes produce redaction", () => {
    const config = makeConfig({
      entityActions: { SSN: "block", EMAIL: "warn" },
    });
    const handler = createToolResultHandler(config, regexEngine);
    const result = handler(
      { message: "SSN 123-45-6789, email john@example.com" },
      {},
    );
    expect(result).toBeDefined();
    const text = result!.message as string;
    // Both block and warn modes produce span-level redaction in tool results
    expect(text).toContain("[SSN_1]");
    expect(text).toContain("[EMAIL_1]");
    expect(text).not.toContain("123-45-6789");
    expect(text).not.toContain("john@example.com");
  });

  it("preserves non-text content blocks", () => {
    const handler = createToolResultHandler(makeConfig(), regexEngine);
    const result = handler(
      {
        message: {
          content: [
            { type: "text", text: "SSN is 123-45-6789" },
            { type: "image", source: { data: "imagedata" } },
          ],
        },
      },
      {},
    );
    expect(result).toBeDefined();
    const msg = result!.message as Record<string, unknown>;
    const content = msg.content as Array<Record<string, unknown>>;
    expect(content[0].text).toBe("SSN is [SSN_1]");
    expect((content[1] as any).type).toBe("image");
    expect((content[1] as any).source.data).toBe("imagedata");
  });

  describe("audit logging", () => {
    it("emits audit log when auditEnabled and PII found", () => {
      const config = makeConfig({ auditEnabled: true });
      const logger = makeLogger();
      const handler = createToolResultHandler(config, regexEngine, logger);

      handler(
        { message: "SSN 123-45-6789", toolName: "file_read" },
        {},
      );

      expect(logger.info).toHaveBeenCalledOnce();
      const logCall = logger.info.mock.calls[0][0] as string;
      expect(logCall).toContain("[FOGCLAW AUDIT]");
      expect(logCall).toContain("tool_result_scan");
      expect(logCall).toContain('"source":"tool_result"');
      expect(logCall).toContain('"toolName":"file_read"');
      expect(logCall).toContain('"SSN"');
      // Must not contain raw PII
      expect(logCall).not.toContain("123-45-6789");
    });

    it("does not emit audit log when auditEnabled is false", () => {
      const config = makeConfig({ auditEnabled: false });
      const logger = makeLogger();
      const handler = createToolResultHandler(config, regexEngine, logger);

      handler({ message: "SSN 123-45-6789" }, {});

      expect(logger.info).not.toHaveBeenCalled();
    });

    it("does not emit audit log when no PII found", () => {
      const config = makeConfig({ auditEnabled: true });
      const logger = makeLogger();
      const handler = createToolResultHandler(config, regexEngine, logger);

      handler({ message: "clean text" }, {});

      expect(logger.info).not.toHaveBeenCalled();
    });

    it("includes entity count and labels in audit log", () => {
      const config = makeConfig({ auditEnabled: true });
      const logger = makeLogger();
      const handler = createToolResultHandler(config, regexEngine, logger);

      handler(
        { message: "Call 555-123-4567, email john@example.com" },
        {},
      );

      const logCall = logger.info.mock.calls[0][0] as string;
      const parsed = JSON.parse(logCall.replace("[FOGCLAW AUDIT] tool_result_scan ", ""));
      expect(parsed.totalEntities).toBe(2);
      expect(parsed.labels).toContain("PHONE");
      expect(parsed.labels).toContain("EMAIL");
      expect(parsed.source).toBe("tool_result");
    });
  });

  it("handles multiple text blocks with PII in different blocks", () => {
    const handler = createToolResultHandler(makeConfig(), regexEngine);
    const result = handler(
      {
        message: {
          content: [
            { type: "text", text: "First block clean" },
            { type: "text", text: "Second block SSN 123-45-6789" },
          ],
        },
      },
      {},
    );
    expect(result).toBeDefined();
    const msg = result!.message as Record<string, unknown>;
    const content = msg.content as Array<Record<string, unknown>>;
    expect(content[0].text).toBe("First block clean");
    expect(content[1].text).toBe("Second block SSN [SSN_1]");
  });
});
