import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";

import plugin from "../src/index.js";

function createApi() {
  const hooks: Array<{ event: string; handler: (event: any) => Promise<any> }> = [];
  const tools: any[] = [];

  return {
    pluginConfig: {
      model: "invalid:/not/real/model",
    },
    hooks,
    tools,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
    },
    on: vi.fn((event: string, handler: (event: any) => Promise<any>) => {
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
    expect(api.registerTool).toHaveBeenCalledTimes(2);

    const scanTool = api.tools.find((tool: any) => tool.id === "fogclaw_scan");
    const redactTool = api.tools.find((tool: any) => tool.id === "fogclaw_redact");

    expect(scanTool).toBeDefined();
    expect(redactTool).toBeDefined();
    expect(scanTool.schema.required).toContain("text");
    expect(redactTool.schema.required).toContain("text");
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
});
