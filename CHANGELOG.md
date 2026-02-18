# Changelog

## 0.3.0

### Added

- **PII access request backlog** — agents can request access to redacted data via `fogclaw_request_access`, users review via `fogclaw_requests`, and resolve (approve/deny/follow-up) via `fogclaw_resolve`. Full async workflow with batch resolve support.
- **RedactionMapStore** — captures placeholder-to-original text mappings from all three scanning hooks, enabling backlog approvals to reveal original data.
- **Configurable `maxPendingRequests`** — caps the number of pending access requests per session (default: 50). Configurable in `fogclaw.config.json` and `openclaw.plugin.json`.
- **FIFO eviction for redaction mappings** — `RedactionMapStore` caps at 10,000 entries by default with oldest-first eviction to prevent unbounded PII accumulation in memory.
- **Access request audit events** — `access_request_created` and `access_request_resolved` structured audit log entries when `auditEnabled: true`. Never includes raw PII.
- **ARCHITECTURE.md** — top-level architecture document covering components, scanning layers, tools, data flow, and key invariants.

## 0.2.0

### Added

- **Tool result PII scanning** — new `tool_result_persist` hook scans file reads, API responses, and web fetches for PII before they enter the session transcript. Uses regex engine (sync) for <1ms latency on the hot path.
- **Outbound message PII scanning** — new `message_sending` hook provides a last-chance gate that catches PII in agent replies before delivery to Telegram, Slack, Discord, and other external channels. Uses full Scanner (regex + GLiNER).
- **Policy allowlist** — whitelist exact strings, regex patterns, or per-entity-type values to skip enforcement on known-safe content (e.g., `noreply@example.com`).
- **Per-entity confidence thresholds** — tune GLiNER detection sensitivity per label (e.g., require 0.7 for PERSON, 0.85 for ORGANIZATION).
- **Audit trail logging** — structured audit log entries with `source` field (`guardrail`, `tool_result`, `outbound`) when `auditEnabled: true`. Logs entity counts and labels without raw PII.
- **Policy preview tool** — `fogclaw_preview` shows which entities would be blocked, warned, or redacted without changing runtime behavior.
- **Scanning architecture documentation** — README now includes a comparison matrix showing engine trade-offs across all three hooks.
- **Control UI hints** — `openclaw.plugin.json` includes `uiHints` for policy configuration in OpenClaw's Control UI.

### Changed

- `resolveAction` extracted to shared `types.ts` module (was duplicated across files).
- README updated with three-layer scanning overview and defense-in-depth flow diagram.

## 0.1.6

Initial scoped release as `@datafog/fogclaw`.

- Dual-engine PII detection (regex + GLiNER via ONNX)
- `before_agent_start` hook for automatic prompt guardrail
- `fogclaw_scan` and `fogclaw_redact` tools
- Configurable per-entity actions (`redact`, `block`, `warn`)
- Multiple redaction strategies (`token`, `mask`, `hash`)
- Custom entity types via GLiNER zero-shot NER
- Graceful degradation to regex-only when GLiNER unavailable
