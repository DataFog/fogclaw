# Architecture

FogClaw is an OpenClaw plugin for PII detection and redaction. It registers hooks and tools via the OpenClaw plugin API.

## Components

```
src/index.ts          Plugin entry point. Creates engines, stores, wires hooks and tools.
src/scanner.ts        Scanner orchestrates regex + GLiNER detection. Async.
src/regex.ts          RegexEngine for synchronous pattern-based PII detection.
src/redactor.ts       redact() applies strategy (token/mask/hash) to detected entities.
src/config.ts         loadConfig() merges user config with defaults, validates.
src/types.ts          All shared type definitions.
```

## Scanning Layers

| Hook | Engine | Sync/Async | Surface |
|---|---|---|---|
| `before_agent_start` | Scanner (regex+GLiNER) | async | User prompts |
| `tool_result_persist` | RegexEngine only | sync | Tool results |
| `message_sending` | Scanner (regex+GLiNER) | async | Outbound messages |

## Tools

| Tool | Purpose |
|---|---|
| `fogclaw_scan` | Scan text for PII entities |
| `fogclaw_preview` | Preview redaction action plan |
| `fogclaw_redact` | Redact PII from text |
| `fogclaw_request_access` | Agent requests access to redacted data |
| `fogclaw_requests` | List/filter access requests by status |
| `fogclaw_resolve` | Approve, deny, or follow-up on access requests |

## Data Flow

Hooks intercept text, scan for PII, redact, and capture placeholder-to-original mappings in `RedactionMapStore`. When an agent needs redacted data, it submits a request to `BacklogStore` via `fogclaw_request_access`. Users review and resolve via `fogclaw_resolve`. Original text is only revealed on explicit approval.

## Key Invariants

- No raw PII in audit logs or error output.
- In-memory stores have configurable size caps with eviction (`RedactionMapStore`: FIFO at 10k, `BacklogStore`: maxPendingRequests at 50).
- Session-scoped: all state is in-memory, discarded on process exit.
- Original text revealed only on explicit user approval via `fogclaw_resolve` with `action: "approve"`.
