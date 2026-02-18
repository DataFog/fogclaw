import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";

import plugin from "../src/index.js";

function createApi() {
  const hooks: Array<{ event: string; handler: (event: any) => any }> = [];
  const tools: any[] = [];

  return {
    pluginConfig: {
      model: "invalid:/not/real/model",
      auditEnabled: true,
    },
    hooks,
    tools,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    on: vi.fn((event: string, handler: (event: any) => any) => {
      hooks.push({ event, handler });
    }),
    registerTool: vi.fn((tool: any) => {
      tools.push(tool);
    }),
  };
}

describe("FogClaw OpenClaw plugin contract (integration path)", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers plugin, hook, and tools", async () => {
    const api = createApi();

    plugin.register(api);

    expect(typeof plugin.register).toBe("function");
    expect(api.on).toHaveBeenCalledWith("before_agent_start", expect.any(Function));
    expect(api.on).toHaveBeenCalledWith("tool_result_persist", expect.any(Function));
    expect(api.on).toHaveBeenCalledWith("message_sending", expect.any(Function));
    expect(api.registerTool).toHaveBeenCalledTimes(6);

    const scanTool = api.tools.find((tool: any) => tool.id === "fogclaw_scan");
    const previewTool = api.tools.find((tool: any) => tool.id === "fogclaw_preview");
    const redactTool = api.tools.find((tool: any) => tool.id === "fogclaw_redact");
    const requestAccessTool = api.tools.find((tool: any) => tool.id === "fogclaw_request_access");
    const requestsTool = api.tools.find((tool: any) => tool.id === "fogclaw_requests");
    const resolveTool = api.tools.find((tool: any) => tool.id === "fogclaw_resolve");

    expect(scanTool).toBeDefined();
    expect(previewTool).toBeDefined();
    expect(redactTool).toBeDefined();
    expect(requestAccessTool).toBeDefined();
    expect(requestsTool).toBeDefined();
    expect(resolveTool).toBeDefined();

    expect(scanTool.schema.required).toContain("text");
    expect(previewTool.schema.required).toContain("text");
    expect(redactTool.schema.required).toContain("text");
    expect(requestAccessTool.schema.required).toContain("placeholder");
    expect(requestsTool.schema.required).toEqual([]);
    expect(resolveTool.schema.required).toContain("action");
  });

  it("validates hook and tool behavior against real Scanner execution path", async () => {
    const api = createApi();

    plugin.register(api);

    const hook = api.hooks.find((entry: any) => entry.event === "before_agent_start");
    expect(hook).toBeDefined();

    const hookResult = await hook!.handler({
      prompt: "Email me at john@example.com today.",
    });

    expect(hookResult).toBeDefined();
    expect(hookResult?.prependContext).toContain("[FOGCLAW REDACTED]");
    expect(hookResult?.prependContext).not.toContain("john@example.com");

    const scanTool = api.tools.find((tool: any) => tool.id === "fogclaw_scan");
    const scanOutput = await scanTool.handler({
      text: "Email me at john@example.com today.",
    });

    expect(scanOutput.content?.[0]?.type).toBe("text");

    const scanParsed = JSON.parse(scanOutput.content[0].text);
    expect(Array.isArray(scanParsed.entities)).toBe(true);
    expect(scanParsed.count).toBe(scanParsed.entities.length);
    expect(scanParsed.entities[0].label).toBe("EMAIL");

    const redactTool = api.tools.find((tool: any) => tool.id === "fogclaw_redact");
    const redactOutput = await redactTool.handler({
      text: "Email me at john@example.com today.",
      strategy: "token",
    });

    const redactParsed = JSON.parse(redactOutput.content[0].text);
    expect(redactParsed.redacted_text).toContain("[EMAIL_");
    expect(redactParsed.redacted_text).not.toContain("john@example.com");
  });

  it("supports preview output with action plan and redacted text", async () => {
    const api = createApi();

    plugin.register(api);

    const previewTool = api.tools.find((tool: any) => tool.id === "fogclaw_preview");

    const previewOutput = await previewTool.handler({
      text: "Email me at john@example.com about Acme Corp tomorrow.",
    });

    const parsed = JSON.parse(previewOutput.content[0].text);
    expect(parsed.totalEntities).toBeGreaterThan(0);
    expect(parsed.actionPlan).toEqual(
      expect.objectContaining({
        blocked: expect.objectContaining({ count: expect.any(Number) }),
        warned: expect.objectContaining({ count: expect.any(Number) }),
        redacted: expect.objectContaining({ count: expect.any(Number) }),
      }),
    );
    expect(typeof parsed.redactedText).toBe("string");
  });

  it("passes custom_labels through tool path in real execution", async () => {
    const api = createApi();

    plugin.register(api);
    const scanTool = api.tools.find((tool: any) => tool.id === "fogclaw_scan");

    const scanOutput = await scanTool.handler({
      text: "Confidential note for Acme project roadmap",
      custom_labels: ["project", "competitor name"],
    });

    const parsed = JSON.parse(scanOutput.content[0].text);
    expect(parsed.count).toBe(parsed.entities.length);
    expect(parsed.entities).toEqual(expect.any(Array));
  });

  it("registers tool_result_persist hook", () => {
    const api = createApi();
    plugin.register(api);

    const hook = api.hooks.find((entry: any) => entry.event === "tool_result_persist");
    expect(hook).toBeDefined();
  });

  it("tool_result_persist hook redacts PII in tool result messages", () => {
    const api = createApi();
    plugin.register(api);

    const hook = api.hooks.find((entry: any) => entry.event === "tool_result_persist");
    expect(hook).toBeDefined();

    // Simulate a tool result containing an SSN
    const result = hook!.handler({
      toolName: "file_read",
      message: "The patient SSN is 123-45-6789 and phone is 555-123-4567.",
    });

    // Handler is synchronous — result should not be a Promise
    expect(result).toBeDefined();
    expect(result?.message).toBeDefined();
    const text = result.message as string;
    expect(text).toContain("[SSN_1]");
    expect(text).toContain("[PHONE_1]");
    expect(text).not.toContain("123-45-6789");
    expect(text).not.toContain("555-123-4567");
  });

  it("tool_result_persist hook returns void for clean tool results", () => {
    const api = createApi();
    plugin.register(api);

    const hook = api.hooks.find((entry: any) => entry.event === "tool_result_persist");
    const result = hook!.handler({
      toolName: "file_read",
      message: "This file contains no sensitive information.",
    });

    expect(result).toBeUndefined();
  });

  it("tool_result_persist hook emits audit log with source tool_result", () => {
    const api = createApi();
    plugin.register(api);

    const hook = api.hooks.find((entry: any) => entry.event === "tool_result_persist");
    hook!.handler({
      toolName: "web_fetch",
      message: "Contact john@example.com for details.",
    });

    // auditEnabled is true in createApi config
    const auditCalls = api.logger.info.mock.calls.filter(
      (call: any[]) => typeof call[0] === "string" && call[0].includes("tool_result_scan"),
    );
    expect(auditCalls.length).toBe(1);
    expect(auditCalls[0][0]).toContain('"source":"tool_result"');
    expect(auditCalls[0][0]).toContain('"toolName":"web_fetch"');
    expect(auditCalls[0][0]).not.toContain("john@example.com");
  });

  it("registers message_sending hook", () => {
    const api = createApi();
    plugin.register(api);

    const hook = api.hooks.find((entry: any) => entry.event === "message_sending");
    expect(hook).toBeDefined();
  });

  it("message_sending hook redacts PII in outbound messages", async () => {
    const api = createApi();
    plugin.register(api);

    const hook = api.hooks.find((entry: any) => entry.event === "message_sending");
    expect(hook).toBeDefined();

    const result = await hook!.handler({
      to: "user123",
      content: "Your SSN is 123-45-6789 and email is john@example.com.",
    }, { channelId: "telegram" });

    expect(result).toBeDefined();
    expect(result.content).toContain("[SSN_1]");
    expect(result.content).toContain("[EMAIL_1]");
    expect(result.content).not.toContain("123-45-6789");
    expect(result.content).not.toContain("john@example.com");
    expect(result.cancel).toBeUndefined();
  });

  it("message_sending hook returns void for clean messages", async () => {
    const api = createApi();
    plugin.register(api);

    const hook = api.hooks.find((entry: any) => entry.event === "message_sending");
    const result = await hook!.handler({
      to: "user123",
      content: "Hello, how can I help?",
    }, { channelId: "slack" });

    expect(result).toBeUndefined();
  });
});
