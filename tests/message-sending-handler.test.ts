import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { createMessageSendingHandler } from "../src/message-sending-handler.js";
import { Scanner } from "../src/scanner.js";
import type { FogClawConfig } from "../src/types.js";

function makeConfig(overrides: Partial<FogClawConfig> = {}): FogClawConfig {
  return {
    enabled: true,
    guardrail_mode: "redact",
    redactStrategy: "token",
    model: "invalid:/not/real/model",
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

function makeCtx(channelId = "telegram") {
  return { channelId };
}

describe("createMessageSendingHandler", () => {
  // Suppress GLiNER init warnings
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("returns an async function", () => {
    const config = makeConfig();
    const scanner = new Scanner(config);
    const handler = createMessageSendingHandler(config, scanner);
    expect(typeof handler).toBe("function");
  });

  it("redacts SSN in outbound message", async () => {
    const config = makeConfig();
    const scanner = new Scanner(config);
    const handler = createMessageSendingHandler(config, scanner);

    const result = await handler(
      { to: "user123", content: "Your SSN is 123-45-6789." },
      makeCtx(),
    );

    expect(result).toBeDefined();
    expect(result!.content).toContain("[SSN_1]");
    expect(result!.content).not.toContain("123-45-6789");
    expect(result!.cancel).toBeUndefined();
  });

  it("redacts email and phone in outbound message", async () => {
    const config = makeConfig();
    const scanner = new Scanner(config);
    const handler = createMessageSendingHandler(config, scanner);

    const result = await handler(
      { to: "user", content: "Call 555-123-4567 or email john@example.com" },
      makeCtx(),
    );

    expect(result).toBeDefined();
    expect(result!.content).toContain("[PHONE_1]");
    expect(result!.content).toContain("[EMAIL_1]");
    expect(result!.content).not.toContain("555-123-4567");
    expect(result!.content).not.toContain("john@example.com");
  });

  it("returns void when no PII found", async () => {
    const config = makeConfig();
    const scanner = new Scanner(config);
    const handler = createMessageSendingHandler(config, scanner);

    const result = await handler(
      { to: "user", content: "Hello, how can I help you today?" },
      makeCtx(),
    );

    expect(result).toBeUndefined();
  });

  it("returns void for empty content", async () => {
    const config = makeConfig();
    const scanner = new Scanner(config);
    const handler = createMessageSendingHandler(config, scanner);

    const result = await handler(
      { to: "user", content: "" },
      makeCtx(),
    );

    expect(result).toBeUndefined();
  });

  it("never returns cancel: true", async () => {
    const config = makeConfig({
      entityActions: { SSN: "block" },
    });
    const scanner = new Scanner(config);
    const handler = createMessageSendingHandler(config, scanner);

    const result = await handler(
      { to: "user", content: "SSN 123-45-6789" },
      makeCtx(),
    );

    expect(result).toBeDefined();
    expect(result!.cancel).toBeUndefined();
    expect(result!.content).toContain("[SSN_1]");
  });

  it("all guardrail modes produce span-level redaction", async () => {
    const config = makeConfig({
      entityActions: { SSN: "block", EMAIL: "warn", PHONE: "redact" },
    });
    const scanner = new Scanner(config);
    const handler = createMessageSendingHandler(config, scanner);

    const result = await handler(
      {
        to: "user",
        content: "SSN 123-45-6789, email john@example.com, call 555-123-4567",
      },
      makeCtx(),
    );

    expect(result).toBeDefined();
    expect(result!.content).toContain("[SSN_1]");
    expect(result!.content).toContain("[EMAIL_1]");
    expect(result!.content).toContain("[PHONE_1]");
  });

  it("respects allowlist — global values", async () => {
    const config = makeConfig({
      allowlist: {
        values: ["noreply@example.com"],
        patterns: [],
        entities: {},
      },
    });
    const scanner = new Scanner(config);
    const handler = createMessageSendingHandler(config, scanner);

    const result = await handler(
      { to: "user", content: "Contact noreply@example.com for help" },
      makeCtx(),
    );

    expect(result).toBeUndefined();
  });

  it("uses mask redaction strategy", async () => {
    const config = makeConfig({ redactStrategy: "mask" });
    const scanner = new Scanner(config);
    const handler = createMessageSendingHandler(config, scanner);

    const result = await handler(
      { to: "user", content: "SSN is 123-45-6789" },
      makeCtx(),
    );

    expect(result).toBeDefined();
    expect(result!.content).toContain("***********");
    expect(result!.content).not.toContain("123-45-6789");
  });

  it("uses hash redaction strategy", async () => {
    const config = makeConfig({ redactStrategy: "hash" });
    const scanner = new Scanner(config);
    const handler = createMessageSendingHandler(config, scanner);

    const result = await handler(
      { to: "user", content: "SSN is 123-45-6789" },
      makeCtx(),
    );

    expect(result).toBeDefined();
    expect(result!.content).toMatch(/\[SSN_[a-f0-9]{12}\]/);
  });

  describe("audit logging", () => {
    it("emits audit log with source outbound when PII found", async () => {
      const config = makeConfig({ auditEnabled: true });
      const scanner = new Scanner(config);
      const logger = makeLogger();
      const handler = createMessageSendingHandler(config, scanner, logger);

      await handler(
        { to: "user", content: "SSN 123-45-6789" },
        makeCtx("discord"),
      );

      expect(logger.info).toHaveBeenCalledOnce();
      const logCall = logger.info.mock.calls[0][0] as string;
      expect(logCall).toContain("[FOGCLAW AUDIT]");
      expect(logCall).toContain("outbound_scan");
      expect(logCall).toContain('"source":"outbound"');
      expect(logCall).toContain('"channelId":"discord"');
      expect(logCall).toContain('"SSN"');
      expect(logCall).not.toContain("123-45-6789");
    });

    it("does not emit audit log when auditEnabled is false", async () => {
      const config = makeConfig({ auditEnabled: false });
      const scanner = new Scanner(config);
      const logger = makeLogger();
      const handler = createMessageSendingHandler(config, scanner, logger);

      await handler(
        { to: "user", content: "SSN 123-45-6789" },
        makeCtx(),
      );

      expect(logger.info).not.toHaveBeenCalled();
    });

    it("does not emit audit log when no PII found", async () => {
      const config = makeConfig({ auditEnabled: true });
      const scanner = new Scanner(config);
      const logger = makeLogger();
      const handler = createMessageSendingHandler(config, scanner, logger);

      await handler(
        { to: "user", content: "Clean message" },
        makeCtx(),
      );

      expect(logger.info).not.toHaveBeenCalled();
    });
  });
});
