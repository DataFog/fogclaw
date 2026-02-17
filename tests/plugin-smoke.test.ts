import { describe, it, expect, vi, beforeEach } from "vitest";

const mockScan = vi.fn();

vi.mock("../src/scanner.js", () => {
  return {
    Scanner: vi.fn().mockImplementation(() => {
      return {
        initialize: vi.fn().mockResolvedValue(undefined),
        scan: mockScan,
      };
    }),
  };
});

import plugin from "../src/index.js";
import type { FogClawConfig } from "../src/types.js";

function createApi(config: Partial<FogClawConfig> = {}) {
  const hooks: Array<{ event: string; handler: Function }> = [];
  const tools: any[] = [];

  return {
    pluginConfig: config,
    hooks,
    tools,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
    },
    on: vi.fn((event: string, handler: Function) => {
      hooks.push({ event, handler });
    }),
    registerTool: vi.fn((tool: any) => {
      tools.push(tool);
    }),
  };
}

describe("FogClaw OpenClaw plugin contract", () => {
  beforeEach(() => {
    mockScan.mockReset();
  });

  it("registers plugin, hook, and tools", async () => {
    const api = createApi({ custom_entities: ["project"] });

    mockScan.mockResolvedValue({
      text: "Email me at john@example.com.",
      entities: [
        {
          text: "john@example.com",
          label: "EMAIL",
          start: 7,
          end: 22,
          confidence: 1,
          source: "regex",
        },
        {
          text: "John Smith",
          label: "PERSON",
          start: 0,
          end: 10,
          confidence: 0.95,
          source: "gliner",
        },
      ],
    });

    await plugin.register(api);

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

  it("redacts via before_agent_start hook and exposes tool contracts", async () => {
    const api = createApi({ custom_entities: [] });

    mockScan.mockResolvedValue({
      text: "Email me at john@example.com today.",
      entities: [
        {
          text: "john@example.com",
          label: "EMAIL",
          start: 7,
          end: 22,
          confidence: 1,
          source: "regex",
        },
      ],
    });

    await plugin.register(api);

    const hook = api.hooks.find((entry) => entry.event === "before_agent_start");
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
    expect(scanParsed.entities).toHaveLength(1);
    expect(scanParsed.entities[0].label).toBe("EMAIL");

    const redactTool = api.tools.find((tool: any) => tool.id === "fogclaw_redact");
    const redactOutput = await redactTool.handler({
      text: "Email me at john@example.com today.",
      strategy: "token",
    });

    const redactParsed = JSON.parse(redactOutput.content[0].text);
    expect(redactParsed.redacted_text).toContain("[EMAIL_1]");
    expect(redactParsed.redacted_text).not.toContain("john@example.com");
  });

  it("passes custom labels from tool scan invocation", async () => {
    const api = createApi({});
    mockScan.mockResolvedValue({
      text: "Acme confidential note",
      entities: [],
    });

    await plugin.register(api);

    const scanTool = api.tools.find((tool: any) => tool.id === "fogclaw_scan");
    await scanTool.handler({
      text: "Acme confidential note",
      custom_labels: ["competitor name"],
    });

    expect(mockScan).toHaveBeenCalledWith("Acme confidential note", ["competitor name"]);
  });
});
