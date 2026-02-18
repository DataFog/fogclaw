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

The `source` field distinguishes scan surfaces: `"prompt"` for `before_agent_start`, `"tool_result"` for `tool_result_persist`.

## Health Signals

- **Plugin registration:** `[fogclaw] Plugin registered` log line at startup confirms the plugin loaded and configured successfully.
- **GLiNER availability:** Logged at startup. If the ONNX model fails to download or load, FogClaw logs a warning and operates in regex-only mode.
- **Scan activity:** Audit entries indicate active scanning. Absence of audit entries when PII is known to be present may indicate misconfiguration, a disabled plugin, or a gap in hook coverage.

## Metrics and Traces

FogClaw does not emit standalone metrics or traces. It operates within OpenClaw's process and relies on the host's observability infrastructure. Audit log entries serve as the primary observability signal.
