/**
 * In-memory backlog store for PII access requests.
 *
 * RedactionMapStore captures placeholder → original text mappings from hooks.
 * BacklogStore manages the access request lifecycle (create, list, resolve).
 *
 * Both are session-scoped: state lives in runtime memory only and is
 * discarded when the process exits.
 */

import type { AccessRequest, RequestStatus } from "./types.js";

/**
 * Stores redaction mappings from hook handlers so that access request
 * approvals can retrieve the original pre-redaction text.
 *
 * Each time a hook redacts text, it calls addMapping() with the
 * redactor's mapping (placeholder → original). When an access request
 * is approved, the backlog looks up the original text here.
 */
export class RedactionMapStore {
  private store = new Map<string, string>();

  /** Merge new placeholder → original entries into the store. */
  addMapping(mapping: Record<string, string>): void {
    for (const [placeholder, original] of Object.entries(mapping)) {
      this.store.set(placeholder, original);
    }
  }

  /** Look up the original text for a redacted placeholder. */
  getOriginal(placeholder: string): string | undefined {
    return this.store.get(placeholder);
  }

  /** Reset all stored mappings. */
  clear(): void {
    this.store.clear();
  }

  /** Number of stored mappings. */
  get size(): number {
    return this.store.size;
  }
}

/**
 * Manages PII access requests throughout their lifecycle.
 *
 * Requests transition through: pending → approved | denied | follow_up.
 * A follow_up request can later be resolved to approved or denied.
 */
export class BacklogStore {
  private requests = new Map<string, AccessRequest>();
  private counter = 0;
  private redactionMap: RedactionMapStore;
  private maxPending: number;

  constructor(redactionMap: RedactionMapStore, maxPending = 50) {
    this.redactionMap = redactionMap;
    this.maxPending = maxPending;
  }

  /** Number of pending requests. */
  get pendingCount(): number {
    let count = 0;
    for (const req of this.requests.values()) {
      if (req.status === "pending" || req.status === "follow_up") count++;
    }
    return count;
  }

  /** Total number of requests in any status. */
  get totalCount(): number {
    return this.requests.size;
  }

  /**
   * Create a new access request.
   *
   * Looks up the original text from the RedactionMapStore automatically.
   * Throws if the pending request limit is reached.
   */
  createRequest(
    placeholder: string,
    entityType: string,
    reason: string,
    context?: string,
  ): AccessRequest {
    if (this.pendingCount >= this.maxPending) {
      throw new Error(
        `Maximum pending requests reached (${this.maxPending}). Resolve existing requests before submitting new ones.`,
      );
    }

    this.counter++;
    const id = `REQ-${this.counter}`;
    const originalText = this.redactionMap.getOriginal(placeholder) ?? null;

    const request: AccessRequest = {
      id,
      placeholder,
      entityType,
      originalText,
      reason,
      context: context ?? null,
      status: "pending",
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      followUpMessage: null,
      responseMessage: null,
    };

    this.requests.set(id, request);
    return request;
  }

  /** Get a single request by ID. */
  getRequest(id: string): AccessRequest | undefined {
    return this.requests.get(id);
  }

  /** List requests, optionally filtered by status. */
  listRequests(statusFilter?: RequestStatus): AccessRequest[] {
    const all = Array.from(this.requests.values());
    if (!statusFilter) return all;
    return all.filter((req) => req.status === statusFilter);
  }

  /**
   * Resolve a single request.
   *
   * - approve: marks as approved, stores response message
   * - deny: marks as denied, stores response message
   * - follow_up: marks as follow_up, stores the follow-up question
   *
   * A follow_up request can be resolved again to approved or denied.
   * Throws if request not found or already in a terminal state (approved/denied).
   */
  resolveRequest(
    id: string,
    action: "approve" | "deny" | "follow_up",
    message?: string,
  ): AccessRequest {
    const request = this.requests.get(id);
    if (!request) {
      throw new Error(`Request "${id}" not found.`);
    }

    if (request.status === "approved" || request.status === "denied") {
      throw new Error(
        `Request "${id}" is already ${request.status}. Cannot resolve again.`,
      );
    }

    const now = new Date().toISOString();

    if (action === "follow_up") {
      request.status = "follow_up";
      request.followUpMessage = message ?? null;
      return request;
    }

    request.status = action === "approve" ? "approved" : "denied";
    request.resolvedAt = now;
    request.responseMessage = message ?? null;
    return request;
  }

  /**
   * Resolve multiple requests with the same action.
   * Returns an array of results (resolved request or error message per ID).
   */
  resolveMultiple(
    ids: string[],
    action: "approve" | "deny" | "follow_up",
    message?: string,
  ): Array<{ id: string; result: AccessRequest | null; error: string | null }> {
    return ids.map((id) => {
      try {
        const resolved = this.resolveRequest(id, action, message);
        return { id, result: resolved, error: null };
      } catch (err) {
        return { id, result: null, error: (err as Error).message };
      }
    });
  }
}
