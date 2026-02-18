# Changelog

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
