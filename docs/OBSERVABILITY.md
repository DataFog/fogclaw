---
title: "Observability"
use_when: "Documenting logging, metrics, tracing, and health check conventions for this repo, including how agents can access signals to self-verify behavior."
---

## Logging Strategy

FogClaw uses `api.logger` provided by OpenClaw during plugin registration. Three log levels are used:

- `info` — Audit log entries for PII detections, plugin lifecycle events (registration, config load).
- `warn` — GLiNER model initialization failures, degraded mode notifications, scan errors that fall back gracefully.
- `error` — Configuration validation failures, unrecoverable errors.

Never log raw PII values. Audit entries include entity counts and type labels only.

## Audit Log Format

When `auditEnabled: true`, FogClaw emits structured JSON audit entries on each scan that detects entities:

    [FOGCLAW AUDIT] guardrail_scan {"totalEntities":2,"blocked":1,"warned":0,"redacted":1,"blockedLabels":["SSN"],"warnedLabels":[],"redactedLabels":["EMAIL"],"source":"prompt"}

The `source` field distinguishes scan surfaces: `"prompt"` for `before_agent_start`, `"tool_result"` for `tool_result_persist`, `"outbound"` for `message_sending`.

### Access Request Audit Events

When the PII access request backlog is used and `auditEnabled: true`, FogClaw emits additional audit events for the request lifecycle:

    [FOGCLAW AUDIT] access_request_created {"request_id":"REQ-1","entity_type":"EMAIL","source":"backlog"}
    [FOGCLAW AUDIT] access_request_resolved {"request_id":"REQ-1","action":"approve","entity_type":"EMAIL","source":"backlog"}
    [FOGCLAW AUDIT] access_request_resolved {"request_id":"REQ-2","action":"deny","entity_type":"SSN","source":"backlog"}
    [FOGCLAW AUDIT] access_request_resolved {"request_id":"REQ-3","action":"follow_up","entity_type":"PERSON","source":"backlog"}

These events include the request ID, entity type, and action taken, but never the original PII text. The `source` field is always `"backlog"` to distinguish from scan events.

## Health Checks

- **Plugin registration:** `[fogclaw] Plugin registered` log line at startup confirms the plugin loaded and configured successfully.
- **GLiNER availability:** Logged at startup. If the ONNX model fails to download or load, FogClaw logs a warning and operates in regex-only mode.
- **Scan activity:** Audit entries indicate active scanning. Absence of audit entries when PII is known to be present may indicate misconfiguration, a disabled plugin, or a gap in hook coverage.

## Metrics

FogClaw does not emit standalone metrics. It operates within OpenClaw's process and relies on the host's observability infrastructure. Audit log entries serve as the primary observability signal.

## Traces

FogClaw does not emit traces. Correlation between scan events can be inferred from audit log timestamps and the `source` field.

## Agent Access

Agents can observe FogClaw's behavior through:

- **Audit log entries:** When `auditEnabled: true`, every scan and access request event is logged with structured JSON. Agents can parse these for entity counts, actions taken, and request lifecycle state.
- **Tool responses:** The `fogclaw_scan`, `fogclaw_preview`, and `fogclaw_requests` tools return structured JSON that agents can use to verify scanning behavior and request status.
