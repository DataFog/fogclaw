/**
 * Tool handler factories for the PII access request backlog.
 *
 * Three tools:
 * - fogclaw_request_access: agent submits a request for redacted data
 * - fogclaw_requests: list/filter backlog requests
 * - fogclaw_resolve: user approves, denies, or asks follow-up
 */

import type { BacklogStore } from "./backlog.js";
import type { FogClawConfig } from "./types.js";

interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
}

interface ToolResponse {
  content: Array<{ type: "text"; text: string }>;
}

function jsonResponse(data: unknown): ToolResponse {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

function errorResponse(message: string): ToolResponse {
  return jsonResponse({ error: message });
}

/**
 * Create handler for fogclaw_request_access tool.
 *
 * Agent calls this when it encounters redacted content and wants
 * to request access to the original text.
 */
export function createRequestAccessHandler(
  backlog: BacklogStore,
  config: FogClawConfig,
  logger?: Logger,
): (toolCallId: string, params: {
  placeholder: string;
  entity_type: string;
  reason: string;
  context?: string;
}) => ToolResponse {
  return (_toolCallId, params) => {
    try {
      const request = backlog.createRequest(
        params.placeholder,
        params.entity_type,
        params.reason,
        params.context,
      );

      if (config.auditEnabled && logger) {
        logger.info(
          `[FOGCLAW AUDIT] access_request_created ${JSON.stringify({
            request_id: request.id,
            entity_type: request.entityType,
            source: "backlog",
          })}`,
        );
      }

      return jsonResponse({
        request_id: request.id,
        status: request.status,
        message: `Access request ${request.id} created for ${params.entity_type} entity "${params.placeholder}". A user must review and approve this request before the original text is revealed.`,
      });
    } catch (err) {
      return errorResponse((err as Error).message);
    }
  };
}

/**
 * Create handler for fogclaw_requests tool.
 *
 * Lists backlog requests, optionally filtered by status.
 * For approved requests, includes the original text.
 */
export function createRequestsListHandler(
  backlog: BacklogStore,
  config: FogClawConfig,
  logger?: Logger,
): (toolCallId: string, params: { status?: string }) => ToolResponse {
  return (_toolCallId, params) => {
    const validStatuses = ["pending", "approved", "denied", "follow_up"];
    const statusFilter = params.status as
      | "pending"
      | "approved"
      | "denied"
      | "follow_up"
      | undefined;

    if (statusFilter && !validStatuses.includes(statusFilter)) {
      return errorResponse(
        `Invalid status filter "${params.status}". Must be one of: ${validStatuses.join(", ")}`,
      );
    }

    const requests = backlog.listRequests(statusFilter);

    const items = requests.map((req) => {
      const item: Record<string, unknown> = {
        id: req.id,
        placeholder: req.placeholder,
        entity_type: req.entityType,
        reason: req.reason,
        context: req.context,
        status: req.status,
        created_at: req.createdAt,
      };

      if (req.status === "approved") {
        item.original_text = req.originalText;
        item.resolved_at = req.resolvedAt;
      }

      if (req.status === "denied") {
        item.resolved_at = req.resolvedAt;
        item.response_message = req.responseMessage;
      }

      if (req.status === "follow_up") {
        item.follow_up_message = req.followUpMessage;
      }

      return item;
    });

    return jsonResponse({
      requests: items,
      total: items.length,
      filter: statusFilter ?? "all",
    });
  };
}

/**
 * Create handler for fogclaw_resolve tool.
 *
 * User resolves a request: approve (reveals original text),
 * deny, or follow_up (asks agent for more context).
 *
 * Supports single request_id or batch request_ids.
 */
export function createResolveHandler(
  backlog: BacklogStore,
  config: FogClawConfig,
  logger?: Logger,
): (toolCallId: string, params: {
  request_id?: string;
  request_ids?: string[];
  action: string;
  message?: string;
}) => ToolResponse {
  return (_toolCallId, params) => {
    const validActions = ["approve", "deny", "follow_up"];
    if (!validActions.includes(params.action)) {
      return errorResponse(
        `Invalid action "${params.action}". Must be one of: ${validActions.join(", ")}`,
      );
    }

    const action = params.action as "approve" | "deny" | "follow_up";

    // Batch resolve
    if (params.request_ids && params.request_ids.length > 0) {
      const results = backlog.resolveMultiple(
        params.request_ids,
        action,
        params.message,
      );

      if (config.auditEnabled && logger) {
        for (const r of results) {
          if (r.result) {
            logger.info(
              `[FOGCLAW AUDIT] access_request_resolved ${JSON.stringify({
                request_id: r.id,
                action,
                entity_type: r.result.entityType,
                source: "backlog",
              })}`,
            );
          }
        }
      }

      return jsonResponse({
        results: results.map((r) => {
          if (r.error) {
            return { id: r.id, error: r.error };
          }
          const item: Record<string, unknown> = {
            id: r.id,
            status: r.result!.status,
          };
          if (action === "approve") {
            item.original_text = r.result!.originalText;
          }
          return item;
        }),
        action,
      });
    }

    // Single resolve
    if (!params.request_id) {
      return errorResponse(
        "Either request_id or request_ids must be provided.",
      );
    }

    try {
      const resolved = backlog.resolveRequest(
        params.request_id,
        action,
        params.message,
      );

      if (config.auditEnabled && logger) {
        logger.info(
          `[FOGCLAW AUDIT] access_request_resolved ${JSON.stringify({
            request_id: resolved.id,
            action,
            entity_type: resolved.entityType,
            source: "backlog",
          })}`,
        );
      }

      const result: Record<string, unknown> = {
        request_id: resolved.id,
        status: resolved.status,
      };

      if (action === "approve") {
        result.original_text = resolved.originalText;
        result.message = resolved.originalText
          ? `Access approved. Original text: ${resolved.originalText}`
          : "Access approved, but original text was not captured during redaction.";
      } else if (action === "deny") {
        result.message = params.message ?? "Access denied.";
      } else if (action === "follow_up") {
        result.message = `Follow-up question sent to agent: "${params.message ?? ""}"`;
      }

      return jsonResponse(result);
    } catch (err) {
      return errorResponse((err as Error).message);
    }
  };
}
