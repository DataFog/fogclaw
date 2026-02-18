import { describe, it, expect, beforeEach } from "vitest";
import { RedactionMapStore, BacklogStore } from "../src/backlog.js";

describe("RedactionMapStore", () => {
  let store: RedactionMapStore;

  beforeEach(() => {
    store = new RedactionMapStore();
  });

  it("stores and retrieves mappings", () => {
    store.addMapping({ "[EMAIL_1]": "john@example.com" });
    expect(store.getOriginal("[EMAIL_1]")).toBe("john@example.com");
  });

  it("returns undefined for unknown placeholders", () => {
    expect(store.getOriginal("[EMAIL_1]")).toBeUndefined();
  });

  it("merges multiple mappings", () => {
    store.addMapping({ "[EMAIL_1]": "a@example.com" });
    store.addMapping({ "[SSN_1]": "123-45-6789" });
    expect(store.getOriginal("[EMAIL_1]")).toBe("a@example.com");
    expect(store.getOriginal("[SSN_1]")).toBe("123-45-6789");
    expect(store.size).toBe(2);
  });

  it("overwrites existing mapping for same placeholder", () => {
    store.addMapping({ "[EMAIL_1]": "old@example.com" });
    store.addMapping({ "[EMAIL_1]": "new@example.com" });
    expect(store.getOriginal("[EMAIL_1]")).toBe("new@example.com");
  });

  it("clears all mappings", () => {
    store.addMapping({ "[EMAIL_1]": "a@example.com", "[SSN_1]": "123-45-6789" });
    store.clear();
    expect(store.size).toBe(0);
    expect(store.getOriginal("[EMAIL_1]")).toBeUndefined();
  });
});

describe("BacklogStore", () => {
  let mapStore: RedactionMapStore;
  let backlog: BacklogStore;

  beforeEach(() => {
    mapStore = new RedactionMapStore();
    mapStore.addMapping({
      "[EMAIL_1]": "john@example.com",
      "[SSN_1]": "123-45-6789",
    });
    backlog = new BacklogStore(mapStore);
  });

  describe("createRequest", () => {
    it("creates a request with auto-incrementing ID", () => {
      const req = backlog.createRequest("[EMAIL_1]", "EMAIL", "Need to send reply");
      expect(req.id).toBe("REQ-1");
      expect(req.placeholder).toBe("[EMAIL_1]");
      expect(req.entityType).toBe("EMAIL");
      expect(req.reason).toBe("Need to send reply");
      expect(req.status).toBe("pending");
      expect(req.originalText).toBe("john@example.com");
      expect(req.context).toBeNull();
      expect(req.resolvedAt).toBeNull();
      expect(req.followUpMessage).toBeNull();
    });

    it("increments IDs across requests", () => {
      const req1 = backlog.createRequest("[EMAIL_1]", "EMAIL", "reason 1");
      const req2 = backlog.createRequest("[SSN_1]", "SSN", "reason 2");
      expect(req1.id).toBe("REQ-1");
      expect(req2.id).toBe("REQ-2");
    });

    it("stores optional context", () => {
      const req = backlog.createRequest(
        "[EMAIL_1]",
        "EMAIL",
        "reason",
        "Found in paragraph about contacts",
      );
      expect(req.context).toBe("Found in paragraph about contacts");
    });

    it("sets originalText to null for unknown placeholders", () => {
      const req = backlog.createRequest("[UNKNOWN_1]", "UNKNOWN", "reason");
      expect(req.originalText).toBeNull();
    });

    it("throws when max pending requests reached", () => {
      const smallBacklog = new BacklogStore(mapStore, 2);
      smallBacklog.createRequest("[EMAIL_1]", "EMAIL", "r1");
      smallBacklog.createRequest("[SSN_1]", "SSN", "r2");
      expect(() =>
        smallBacklog.createRequest("[EMAIL_1]", "EMAIL", "r3"),
      ).toThrow("Maximum pending requests reached (2)");
    });

    it("allows new requests after resolving existing ones", () => {
      const smallBacklog = new BacklogStore(mapStore, 2);
      smallBacklog.createRequest("[EMAIL_1]", "EMAIL", "r1");
      smallBacklog.createRequest("[SSN_1]", "SSN", "r2");
      smallBacklog.resolveRequest("REQ-1", "deny");
      const req3 = smallBacklog.createRequest("[EMAIL_1]", "EMAIL", "r3");
      expect(req3.id).toBe("REQ-3");
    });
  });

  describe("getRequest", () => {
    it("returns a request by ID", () => {
      backlog.createRequest("[EMAIL_1]", "EMAIL", "reason");
      const req = backlog.getRequest("REQ-1");
      expect(req).toBeDefined();
      expect(req!.placeholder).toBe("[EMAIL_1]");
    });

    it("returns undefined for unknown ID", () => {
      expect(backlog.getRequest("REQ-999")).toBeUndefined();
    });
  });

  describe("listRequests", () => {
    it("returns all requests when no filter", () => {
      backlog.createRequest("[EMAIL_1]", "EMAIL", "r1");
      backlog.createRequest("[SSN_1]", "SSN", "r2");
      expect(backlog.listRequests()).toHaveLength(2);
    });

    it("filters by status", () => {
      backlog.createRequest("[EMAIL_1]", "EMAIL", "r1");
      backlog.createRequest("[SSN_1]", "SSN", "r2");
      backlog.resolveRequest("REQ-1", "approve");

      expect(backlog.listRequests("pending")).toHaveLength(1);
      expect(backlog.listRequests("approved")).toHaveLength(1);
      expect(backlog.listRequests("denied")).toHaveLength(0);
    });
  });

  describe("resolveRequest", () => {
    it("approves a pending request", () => {
      backlog.createRequest("[EMAIL_1]", "EMAIL", "reason");
      const resolved = backlog.resolveRequest("REQ-1", "approve");
      expect(resolved.status).toBe("approved");
      expect(resolved.resolvedAt).toBeTruthy();
    });

    it("denies a pending request", () => {
      backlog.createRequest("[EMAIL_1]", "EMAIL", "reason");
      const resolved = backlog.resolveRequest("REQ-1", "deny", "Not needed");
      expect(resolved.status).toBe("denied");
      expect(resolved.responseMessage).toBe("Not needed");
    });

    it("sets follow-up on a pending request", () => {
      backlog.createRequest("[EMAIL_1]", "EMAIL", "reason");
      const resolved = backlog.resolveRequest(
        "REQ-1",
        "follow_up",
        "Why do you need this?",
      );
      expect(resolved.status).toBe("follow_up");
      expect(resolved.followUpMessage).toBe("Why do you need this?");
      expect(resolved.resolvedAt).toBeNull();
    });

    it("allows resolving a follow_up request to approved", () => {
      backlog.createRequest("[EMAIL_1]", "EMAIL", "reason");
      backlog.resolveRequest("REQ-1", "follow_up", "Why?");
      const resolved = backlog.resolveRequest("REQ-1", "approve");
      expect(resolved.status).toBe("approved");
      expect(resolved.resolvedAt).toBeTruthy();
    });

    it("throws for unknown request ID", () => {
      expect(() => backlog.resolveRequest("REQ-999", "approve")).toThrow(
        'Request "REQ-999" not found',
      );
    });

    it("throws when resolving already approved request", () => {
      backlog.createRequest("[EMAIL_1]", "EMAIL", "reason");
      backlog.resolveRequest("REQ-1", "approve");
      expect(() => backlog.resolveRequest("REQ-1", "deny")).toThrow(
        'Request "REQ-1" is already approved',
      );
    });

    it("throws when resolving already denied request", () => {
      backlog.createRequest("[EMAIL_1]", "EMAIL", "reason");
      backlog.resolveRequest("REQ-1", "deny");
      expect(() => backlog.resolveRequest("REQ-1", "approve")).toThrow(
        'Request "REQ-1" is already denied',
      );
    });
  });

  describe("resolveMultiple", () => {
    it("resolves multiple requests at once", () => {
      backlog.createRequest("[EMAIL_1]", "EMAIL", "r1");
      backlog.createRequest("[SSN_1]", "SSN", "r2");

      const results = backlog.resolveMultiple(["REQ-1", "REQ-2"], "approve");
      expect(results).toHaveLength(2);
      expect(results[0].result?.status).toBe("approved");
      expect(results[1].result?.status).toBe("approved");
      expect(results[0].error).toBeNull();
    });

    it("returns errors for invalid IDs without failing others", () => {
      backlog.createRequest("[EMAIL_1]", "EMAIL", "r1");

      const results = backlog.resolveMultiple(
        ["REQ-1", "REQ-999"],
        "approve",
      );
      expect(results[0].result?.status).toBe("approved");
      expect(results[0].error).toBeNull();
      expect(results[1].result).toBeNull();
      expect(results[1].error).toContain("not found");
    });
  });

  describe("pendingCount", () => {
    it("counts pending and follow_up requests", () => {
      backlog.createRequest("[EMAIL_1]", "EMAIL", "r1");
      backlog.createRequest("[SSN_1]", "SSN", "r2");
      expect(backlog.pendingCount).toBe(2);

      backlog.resolveRequest("REQ-1", "follow_up", "why?");
      expect(backlog.pendingCount).toBe(2);

      backlog.resolveRequest("REQ-1", "approve");
      expect(backlog.pendingCount).toBe(1);

      backlog.resolveRequest("REQ-2", "deny");
      expect(backlog.pendingCount).toBe(0);
    });
  });
});
