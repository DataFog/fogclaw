# Changelog

## 0.4.0

### Fixed

- **Tool registration matches the OpenClaw plugin contract** — all 6 tools were registered with `schema:`/`handler:`, which the runtime does not recognize; tool calls failed before reaching the model. Tools now register with `parameters:` and `execute(toolCallId, params)`. Discovered in E2E testing (PR #3), verified against current upstream docs.
- **Outbound redaction stays on the regex path** (#4, thanks @hanhuihanhui) — `message_sending` now uses regex-only scanning to keep reply delivery fast, consistent with the tool-result path. Also removes an undeclared direct import of `@xenova/transformers`.

### Added

- **SECRET and TOKEN detection** (#4) — assigned credentials (`client_secret=…`, `password: …`) and tokens (`api_key=…`, `Bearer …`) are now detected and redacted by the regex engine.
- **`contracts.tools` manifest declaration** — the six FogClaw tools are declared in `openclaw.plugin.json`, required for tool discovery in current OpenClaw.
- **`openclaw.compat` metadata** in `package.json` (`pluginApi >=2026.3.24-beta.2`); Node engine floor raised to 22.19.

### Security

- **Allowlist hardening** (ported from datafog-python 4.7.0) — patterns must match the full entity text, so a partial match never suppresses a finding; quantified groups containing nested quantifiers (e.g. `(a+)+`) are rejected at config time to prevent catastrophic backtracking on attacker-influenced entity text; patterns are capped at 512 chars; entities longer than 512 chars skip pattern matching fail-safe (the finding is kept).
- **Dependency vulnerabilities cleared** — `npm audit` reported 10 vulnerabilities (2 critical); now 0. protobufjs/rollup/tar transitives fixed, vitest 2→4, sharp 0.34.5→0.35.3.

### Changed (OpenClaw 2026.6.11 compatibility)

- **Typed against the real plugin SDK** — `openclaw` 2026.6.11 is now a devDependency; the entry point uses `definePluginEntry` with `OpenClawPluginApi`, and tool schemas are TypeBox objects (`typebox` pinned to OpenClaw's vendored 1.1.39). Verified: the plugin loads, registers, and attaches all hooks in a live isolated-profile `openclaw plugins list` / `doctor` run.
- **Inbound guardrail migrated** from deprecated `before_agent_start` to `before_prompt_build`.
- **Hard blocking via `before_agent_run`** — when block actions are configured, FogClaw now stops the run outright instead of only injecting a block instruction. Requires `plugins.entries.fogclaw.hooks.allowConversationAccess: true`; falls back to the prompt-level instruction when unavailable.
- **`reply_payload_sending` hook added** — media captions and normalized payload text do not always flow through `message_sending`; this closes that outbound gap.
- **Shared allowlist matcher** (`src/allowlist.ts`) — the tool-result path had a duplicate of the pre-hardening allowlist logic, so partial pattern matches could still suppress findings there. Both paths now share fullmatch anchoring and the 512-char fail-safe subject cap. Allowlist patterns now anchor on the tool-result path too: a prefix pattern like `^internal-` must become `^internal-.*`.

### Security (continued)

- **`fogclaw_redact` and `fogclaw_preview` no longer return the placeholder→original mapping** in model-visible tool output — returning it partially defeated redaction (the mapping persisted in the session transcript). `fogclaw_redact` now feeds the mapping into `RedactionMapStore` and returns the placeholder list; originals are recoverable only through the access-request backlog (`fogclaw_request_access` → user approval via `fogclaw_resolve`).

### Known follow-ups

- Live end-to-end agent turn (gateway + real provider) exercising all four hook layers; rebuild the E2E baseline from closed PR #3 against the current runtime.
- onnxruntime pins unchanged: gliner 0.0.19 (latest) expects onnxruntime 1.19.x internals; revisit when gliner updates.
- `fogclaw_scan`/`fogclaw_preview` still return detected entity spans (including matched text) for caller-supplied input; unlike the mapping this reveals nothing the caller did not already have, but consider a count-only output mode for transcript hygiene.

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
