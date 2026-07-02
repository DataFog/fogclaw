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
    expect(api.on).toHaveBeenCalledWith("before_prompt_build", expect.any(Function));
    expect(api.on).toHaveBeenCalledWith("tool_result_persist", expect.any(Function));
    expect(api.on).toHaveBeenCalledWith("message_sending", expect.any(Function));
    expect(api.on).toHaveBeenCalledWith("reply_payload_sending", expect.any(Function));
    expect(api.registerTool).toHaveBeenCalledTimes(6);

    const scanTool = api.tools.find((tool: any) => tool.name === "fogclaw_scan");
    const previewTool = api.tools.find((tool: any) => tool.name === "fogclaw_preview");
    const redactTool = api.tools.find((tool: any) => tool.name === "fogclaw_redact");
    const requestAccessTool = api.tools.find((tool: any) => tool.name === "fogclaw_request_access");
    const requestsTool = api.tools.find((tool: any) => tool.name === "fogclaw_requests");
    const resolveTool = api.tools.find((tool: any) => tool.name === "fogclaw_resolve");

    expect(scanTool).toBeDefined();
    expect(previewTool).toBeDefined();
    expect(redactTool).toBeDefined();
    expect(requestAccessTool).toBeDefined();
    expect(requestsTool).toBeDefined();
    expect(resolveTool).toBeDefined();

    expect(scanTool.parameters.required).toContain("text");
    expect(previewTool.parameters.required).toContain("text");
    expect(redactTool.parameters.required).toContain("text");
    expect(requestAccessTool.parameters.required).toContain("placeholder");
    expect(requestsTool.parameters.required ?? []).toEqual([]);
    expect(resolveTool.parameters.required).toContain("action");
  });

  it("validates hook and tool behavior against real Scanner execution path", async () => {
    const api = createApi();

    plugin.register(api);

    const hook = api.hooks.find((entry: any) => entry.event === "before_prompt_build");
    expect(hook).toBeDefined();

    const hookResult = await hook!.handler({
      prompt: "Email me at john@example.com today.",
    });

    expect(hookResult).toBeDefined();
    expect(hookResult?.prependContext).toContain("[FOGCLAW REDACTED]");
    expect(hookResult?.prependContext).not.toContain("john@example.com");

    const scanTool = api.tools.find((tool: any) => tool.name === "fogclaw_scan");
    const scanOutput = await scanTool.execute("test", {
      text: "Email me at john@example.com today.",
    });

    expect(scanOutput.content?.[0]?.type).toBe("text");

    const scanParsed = JSON.parse(scanOutput.content[0].text);
    expect(Array.isArray(scanParsed.entities)).toBe(true);
    expect(scanParsed.count).toBe(scanParsed.entities.length);
    expect(scanParsed.entities[0].label).toBe("EMAIL");

    const redactTool = api.tools.find((tool: any) => tool.name === "fogclaw_redact");
    const redactOutput = await redactTool.execute("test", {
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

    const previewTool = api.tools.find((tool: any) => tool.name === "fogclaw_preview");

    const previewOutput = await previewTool.execute("test", {
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
    const scanTool = api.tools.find((tool: any) => tool.name === "fogclaw_scan");

    const scanOutput = await scanTool.execute("test", {
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

  it("fogclaw_redact does not expose the redaction mapping in tool output", async () => {
    const api = createApi();
    plugin.register(api);

    const email = "jane.doe@" + "example.com";
    const redactTool = api.tools.find((tool: any) => tool.name === "fogclaw_redact");
    const output = await redactTool.execute("test", {
      text: `Email me at ${email} today.`,
      strategy: "token",
    });

    const raw = output.content[0].text;
    const parsed = JSON.parse(raw);
    expect(parsed.redacted_text).toContain("[EMAIL_1]");
    expect(parsed.mapping).toBeUndefined();
    expect(raw).not.toContain(email);
    expect(parsed.placeholders).toEqual(["[EMAIL_1]"]);
  });

  it("fogclaw_redact feeds the access-request backlog for controlled reveals", async () => {
    const api = createApi();
    plugin.register(api);

    const email = "jane.doe@" + "example.com";
    const redactTool = api.tools.find((tool: any) => tool.name === "fogclaw_redact");
    await redactTool.execute("test", { text: `Email me at ${email} today.` });

    const requestTool = api.tools.find((tool: any) => tool.name === "fogclaw_request_access");
    const requestOutput = await requestTool.execute("test", {
      placeholder: "[EMAIL_1]",
      entity_type: "EMAIL",
      reason: "need to send a reply",
    });
    const requestParsed = JSON.parse(requestOutput.content[0].text);
    expect(requestParsed.request_id).toBeDefined();

    const resolveTool = api.tools.find((tool: any) => tool.name === "fogclaw_resolve");
    const resolveOutput = await resolveTool.execute("test", {
      request_id: requestParsed.request_id,
      action: "approve",
    });
    const resolveParsed = JSON.parse(resolveOutput.content[0].text);
    expect(resolveParsed.original_text).toBe(email);
  });

  it("fogclaw_preview does not expose the redaction mapping", async () => {
    const api = createApi();
    plugin.register(api);

    const email = "jane.doe@" + "example.com";
    const previewTool = api.tools.find((tool: any) => tool.name === "fogclaw_preview");
    const output = await previewTool.execute("test", { text: `Reach me at ${email}.` });

    const parsed = JSON.parse(output.content[0].text);
    expect(parsed.mapping).toBeUndefined();
    expect(parsed.redactedText).toContain("[EMAIL_1]");
  });

  it("reply_payload_sending hook redacts payload text", () => {
    const api = createApi();
    plugin.register(api);

    const hook = api.hooks.find((entry: any) => entry.event === "reply_payload_sending");
    expect(hook).toBeDefined();

    const email = "jane.doe@" + "example.com";
    const result = hook!.handler({
      payload: { text: `Contact ${email} for details.` },
      kind: "final",
    });

    expect(result).toBeDefined();
    expect(result.payload.text).toContain("[EMAIL_1]");
    expect(result.payload.text).not.toContain(email);
  });

  it("reply_payload_sending hook returns void for clean or empty payloads", () => {
    const api = createApi();
    plugin.register(api);

    const hook = api.hooks.find((entry: any) => entry.event === "reply_payload_sending");

    expect(hook!.handler({ payload: { text: "All clear." }, kind: "final" })).toBeUndefined();
    expect(hook!.handler({ payload: { mediaUrl: "https://example.com/x.png" }, kind: "final" })).toBeUndefined();
  });

  it("does not register before_agent_run gate in redact mode", () => {
    const api = createApi();
    plugin.register(api);

    const hook = api.hooks.find((entry: any) => entry.event === "before_agent_run");
    expect(hook).toBeUndefined();
  });

  it("before_agent_run gate blocks runs containing blocked entities", async () => {
    const api = createApi();
    api.pluginConfig = {
      ...api.pluginConfig,
      guardrail_mode: "block",
    };
    plugin.register(api);

    const hook = api.hooks.find((entry: any) => entry.event === "before_agent_run");
    expect(hook).toBeDefined();

    const ssn = "123-45" + "-6789";
    const blocked = await hook!.handler({ prompt: `My SSN is ${ssn}.`, messages: [] });
    expect(blocked.outcome).toBe("block");
    expect(blocked.reason).toContain("SSN");
    expect(blocked.reason).not.toContain(ssn);
    expect(blocked.message).not.toContain(ssn);

    const passed = await hook!.handler({ prompt: "Hello there.", messages: [] });
    expect(passed.outcome).toBe("pass");
  });
});
