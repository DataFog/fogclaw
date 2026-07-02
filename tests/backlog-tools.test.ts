import { describe, it, expect, vi, beforeEach } from "vitest";
import { RedactionMapStore, BacklogStore } from "../src/backlog.js";
import {
  createRequestAccessHandler,
  createRequestsListHandler,
  createResolveHandler,
} from "../src/backlog-tools.js";
import { loadConfig } from "../src/config.js";
import type { FogClawConfig } from "../src/types.js";

function makeConfig(overrides: Partial<FogClawConfig> = {}): FogClawConfig {
  return loadConfig({ ...overrides });
}

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn() };
}

function parseToolResponse(response: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(response.content[0].text);
}

describe("fogclaw_request_access handler", () => {
  let mapStore: RedactionMapStore;
  let backlog: BacklogStore;
  let config: FogClawConfig;
  let logger: ReturnType<typeof makeLogger>;

  beforeEach(() => {
    mapStore = new RedactionMapStore();
    mapStore.addMapping({
      "[EMAIL_1]": "john@example.com",
      "[SSN_1]": "123-45-6789",
    });
    config = makeConfig();
    backlog = new BacklogStore(mapStore, config.maxPendingRequests);
    logger = makeLogger();
  });

  it("creates a request and returns confirmation", () => {
    const handler = createRequestAccessHandler(backlog, config, logger);
    const response = handler("test", {
      placeholder: "[EMAIL_1]",
      entity_type: "EMAIL",
      reason: "Need to send a follow-up email",
    });

    const parsed = parseToolResponse(response);
    expect(parsed.request_id).toBe("REQ-1");
    expect(parsed.status).toBe("pending");
    expect(parsed.message).toContain("REQ-1");
  });

  it("emits audit log when auditEnabled", () => {
    const handler = createRequestAccessHandler(backlog, config, logger);
    handler("test", {
      placeholder: "[EMAIL_1]",
      entity_type: "EMAIL",
      reason: "reason",
    });

    const auditCalls = logger.info.mock.calls.filter(
      (call: string[]) => call[0].includes("access_request_created"),
    );
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0][0]).toContain('"request_id":"REQ-1"');
    expect(auditCalls[0][0]).toContain('"entity_type":"EMAIL"');
    expect(auditCalls[0][0]).not.toContain("john@example.com");
  });

  it("does not emit audit log when auditEnabled is false", () => {
    const noAuditConfig = makeConfig({ auditEnabled: false });
    const handler = createRequestAccessHandler(backlog, noAuditConfig, logger);
    handler("test", {
      placeholder: "[EMAIL_1]",
      entity_type: "EMAIL",
      reason: "reason",
    });

    expect(logger.info).not.toHaveBeenCalled();
  });

  it("returns error when max pending reached", () => {
    const smallConfig = makeConfig({ maxPendingRequests: 1 });
    const smallBacklog = new BacklogStore(mapStore, smallConfig.maxPendingRequests);
    const handler = createRequestAccessHandler(smallBacklog, smallConfig, logger);

    handler("test", { placeholder: "[EMAIL_1]", entity_type: "EMAIL", reason: "r1" });
    const response = handler("test", { placeholder: "[SSN_1]", entity_type: "SSN", reason: "r2" });

    const parsed = parseToolResponse(response);
    expect(parsed.error).toContain("Maximum pending requests reached");
  });

  it("includes context when provided", () => {
    const handler = createRequestAccessHandler(backlog, config, logger);
    handler("test", {
      placeholder: "[EMAIL_1]",
      entity_type: "EMAIL",
      reason: "reason",
      context: "Found in the contact section",
    });

    const req = backlog.getRequest("REQ-1");
    expect(req?.context).toBe("Found in the contact section");
  });
});

describe("fogclaw_requests handler", () => {
  let mapStore: RedactionMapStore;
  let backlog: BacklogStore;
  let config: FogClawConfig;
  let logger: ReturnType<typeof makeLogger>;

  beforeEach(() => {
    mapStore = new RedactionMapStore();
    mapStore.addMapping({
      "[EMAIL_1]": "john@example.com",
      "[SSN_1]": "123-45-6789",
    });
    config = makeConfig();
    backlog = new BacklogStore(mapStore);
    logger = makeLogger();
  });

  it("returns empty list when no requests", () => {
    const handler = createRequestsListHandler(backlog, config, logger);
    const parsed = parseToolResponse(handler("test", {}));
    expect(parsed.requests).toEqual([]);
    expect(parsed.total).toBe(0);
  });

  it("lists all requests without filter", () => {
    backlog.createRequest("[EMAIL_1]", "EMAIL", "r1");
    backlog.createRequest("[SSN_1]", "SSN", "r2");

    const handler = createRequestsListHandler(backlog, config, logger);
    const parsed = parseToolResponse(handler("test", {}));
    expect(parsed.requests).toHaveLength(2);
    expect(parsed.filter).toBe("all");
  });

  it("filters by status", () => {
    backlog.createRequest("[EMAIL_1]", "EMAIL", "r1");
    backlog.createRequest("[SSN_1]", "SSN", "r2");
    backlog.resolveRequest("REQ-1", "approve");

    const handler = createRequestsListHandler(backlog, config, logger);

    const pending = parseToolResponse(handler("test", { status: "pending" }));
    expect(pending.requests).toHaveLength(1);
    expect(pending.requests[0].id).toBe("REQ-2");

    const approved = parseToolResponse(handler("test", { status: "approved" }));
    expect(approved.requests).toHaveLength(1);
    expect(approved.requests[0].id).toBe("REQ-1");
    expect(approved.requests[0].original_text).toBe("john@example.com");
  });

  it("returns error for invalid status filter", () => {
    const handler = createRequestsListHandler(backlog, config, logger);
    const parsed = parseToolResponse(handler("test", { status: "invalid" }));
    expect(parsed.error).toContain("Invalid status filter");
  });

  it("includes follow_up message in listing", () => {
    backlog.createRequest("[EMAIL_1]", "EMAIL", "r1");
    backlog.resolveRequest("REQ-1", "follow_up", "Why do you need this?");

    const handler = createRequestsListHandler(backlog, config, logger);
    const parsed = parseToolResponse(handler("test", { status: "follow_up" }));
    expect(parsed.requests[0].follow_up_message).toBe("Why do you need this?");
  });

  it("includes response_message for denied requests", () => {
    backlog.createRequest("[EMAIL_1]", "EMAIL", "r1");
    backlog.resolveRequest("REQ-1", "deny", "Not authorized");

    const handler = createRequestsListHandler(backlog, config, logger);
    const parsed = parseToolResponse(handler("test", { status: "denied" }));
    expect(parsed.requests[0].response_message).toBe("Not authorized");
  });
});

describe("fogclaw_resolve handler", () => {
  let mapStore: RedactionMapStore;
  let backlog: BacklogStore;
  let config: FogClawConfig;
  let logger: ReturnType<typeof makeLogger>;

  beforeEach(() => {
    mapStore = new RedactionMapStore();
    mapStore.addMapping({
      "[EMAIL_1]": "john@example.com",
      "[SSN_1]": "123-45-6789",
    });
    config = makeConfig();
    backlog = new BacklogStore(mapStore);
    logger = makeLogger();
    backlog.createRequest("[EMAIL_1]", "EMAIL", "Need to send reply");
  });

  it("approves a request and returns original text", () => {
    const handler = createResolveHandler(backlog, config, logger);
    const parsed = parseToolResponse(
      handler("test", { request_id: "REQ-1", action: "approve" }),
    );
    expect(parsed.status).toBe("approved");
    expect(parsed.original_text).toBe("john@example.com");
    expect(parsed.message).toContain("john@example.com");
  });

  it("denies a request", () => {
    const handler = createResolveHandler(backlog, config, logger);
    const parsed = parseToolResponse(
      handler("test", { request_id: "REQ-1", action: "deny", message: "Not needed" }),
    );
    expect(parsed.status).toBe("denied");
    expect(parsed.message).toBe("Not needed");
  });

  it("sends follow-up question", () => {
    const handler = createResolveHandler(backlog, config, logger);
    const parsed = parseToolResponse(
      handler("test", {
        request_id: "REQ-1",
        action: "follow_up",
        message: "Why do you need this email?",
      }),
    );
    expect(parsed.status).toBe("follow_up");
    expect(parsed.message).toContain("Why do you need this email?");
  });

  it("returns error for invalid action", () => {
    const handler = createResolveHandler(backlog, config, logger);
    const parsed = parseToolResponse(
      handler("test", { request_id: "REQ-1", action: "invalid" }),
    );
    expect(parsed.error).toContain("Invalid action");
  });

  it("returns error for unknown request ID", () => {
    const handler = createResolveHandler(backlog, config, logger);
    const parsed = parseToolResponse(
      handler("test", { request_id: "REQ-999", action: "approve" }),
    );
    expect(parsed.error).toContain("not found");
  });

  it("returns error when no request_id or request_ids provided", () => {
    const handler = createResolveHandler(backlog, config, logger);
    const parsed = parseToolResponse(handler("test", { action: "approve" }));
    expect(parsed.error).toContain("request_id or request_ids must be provided");
  });

  it("batch resolves multiple requests", () => {
    backlog.createRequest("[SSN_1]", "SSN", "Need for verification");
    const handler = createResolveHandler(backlog, config, logger);
    const parsed = parseToolResponse(
      handler("test", { request_ids: ["REQ-1", "REQ-2"], action: "approve" }),
    );
    expect(parsed.results).toHaveLength(2);
    expect(parsed.results[0].status).toBe("approved");
    expect(parsed.results[0].original_text).toBe("john@example.com");
    expect(parsed.results[1].status).toBe("approved");
    expect(parsed.results[1].original_text).toBe("123-45-6789");
  });

  it("batch resolve returns errors for invalid IDs", () => {
    const handler = createResolveHandler(backlog, config, logger);
    const parsed = parseToolResponse(
      handler("test", { request_ids: ["REQ-1", "REQ-999"], action: "approve" }),
    );
    expect(parsed.results[0].status).toBe("approved");
    expect(parsed.results[1].error).toContain("not found");
  });

  it("emits audit log on resolve", () => {
    const handler = createResolveHandler(backlog, config, logger);
    handler("test", { request_id: "REQ-1", action: "approve" });

    const auditCalls = logger.info.mock.calls.filter(
      (call: string[]) => call[0].includes("access_request_resolved"),
    );
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0][0]).toContain('"action":"approve"');
    expect(auditCalls[0][0]).not.toContain("john@example.com");
  });

  it("emits audit for each request in batch resolve", () => {
    backlog.createRequest("[SSN_1]", "SSN", "r2");
    const handler = createResolveHandler(backlog, config, logger);
    handler("test", { request_ids: ["REQ-1", "REQ-2"], action: "deny" });

    const auditCalls = logger.info.mock.calls.filter(
      (call: string[]) => call[0].includes("access_request_resolved"),
    );
    expect(auditCalls).toHaveLength(2);
  });
});

describe("full lifecycle integration", () => {
  it("request → list → approve → check approved", () => {
    const mapStore = new RedactionMapStore();
    mapStore.addMapping({ "[EMAIL_1]": "john@example.com" });
    const config = makeConfig();
    const backlog = new BacklogStore(mapStore);
    const logger = makeLogger();

    // Step 1: Agent submits request
    const requestHandler = createRequestAccessHandler(backlog, config, logger);
    const requestResponse = parseToolResponse(
      requestHandler("test", {
        placeholder: "[EMAIL_1]",
        entity_type: "EMAIL",
        reason: "Need to send follow-up",
      }),
    );
    expect(requestResponse.request_id).toBe("REQ-1");
    expect(requestResponse.status).toBe("pending");

    // Step 2: User lists pending requests
    const listHandler = createRequestsListHandler(backlog, config, logger);
    const listResponse = parseToolResponse(listHandler("test", { status: "pending" }));
    expect(listResponse.requests).toHaveLength(1);
    expect(listResponse.requests[0].reason).toBe("Need to send follow-up");

    // Step 3: User approves
    const resolveHandler = createResolveHandler(backlog, config, logger);
    const resolveResponse = parseToolResponse(
      resolveHandler("test", { request_id: "REQ-1", action: "approve" }),
    );
    expect(resolveResponse.status).toBe("approved");
    expect(resolveResponse.original_text).toBe("john@example.com");

    // Step 4: Agent checks approved requests
    const approvedResponse = parseToolResponse(
      listHandler("test", { status: "approved" }),
    );
    expect(approvedResponse.requests).toHaveLength(1);
    expect(approvedResponse.requests[0].original_text).toBe("john@example.com");
  });

  it("request → follow_up → approve", () => {
    const mapStore = new RedactionMapStore();
    mapStore.addMapping({ "[SSN_1]": "123-45-6789" });
    const config = makeConfig();
    const backlog = new BacklogStore(mapStore);
    const logger = makeLogger();

    const requestHandler = createRequestAccessHandler(backlog, config, logger);
    const listHandler = createRequestsListHandler(backlog, config, logger);
    const resolveHandler = createResolveHandler(backlog, config, logger);

    // Agent requests
    requestHandler("test", {
      placeholder: "[SSN_1]",
      entity_type: "SSN",
      reason: "Need for identity verification",
    });

    // User asks follow-up
    resolveHandler("test", {
      request_id: "REQ-1",
      action: "follow_up",
      message: "What specific verification requires the SSN?",
    });

    // Agent checks follow-up
    const followUpList = parseToolResponse(
      listHandler("test", { status: "follow_up" }),
    );
    expect(followUpList.requests[0].follow_up_message).toBe(
      "What specific verification requires the SSN?",
    );

    // User approves after receiving context
    const resolved = parseToolResponse(
      resolveHandler("test", { request_id: "REQ-1", action: "approve" }),
    );
    expect(resolved.original_text).toBe("123-45-6789");
  });
});
