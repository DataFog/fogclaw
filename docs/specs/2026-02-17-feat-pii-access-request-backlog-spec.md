---
slug: 2026-02-17-feat-pii-access-request-backlog
status: intake-complete
date: 2026-02-17T00:00:00Z
owner: sidmohan
plan_mode: execution
spike_recommended: no
priority: high
---

# feat: PII Access Request Backlog

## Purpose / Big Picture

When FogClaw redacts PII from agent-visible content, the agent loses access to information it may genuinely need to complete a task. Today, the only options are to silently redact (agent works with incomplete data) or block entirely (agent stops). Neither is ideal.

This feature introduces a **PII access request backlog** — a structured workflow where agents can request access to specific redacted entities, and users can asynchronously review, approve, deny, or ask for more context before revealing the original data. This balances security (PII stays redacted by default) with usability (agents can request what they need, users stay in control).

**Target user**: A developer running an OpenClaw agent locally who wants fine-grained control over which redacted data the agent can access, without pre-configuring broad allowlist rules.

## Scope

### In Scope

- A new tool for agents to submit access requests when they encounter redacted content
- Persistent local storage for the request backlog (survives across tool calls within a session)
- Tools for users to list pending requests and resolve them (approve/deny/ask follow-up)
- Approved requests return the original (pre-redaction) text as tool output, scoped to the current session only
- Follow-up question flow: user can respond with a question, agent sees the question on next backlog check
- Request metadata: entity type, redacted placeholder, surrounding context, agent's stated reason, timestamp
- Audit logging of request creation and resolution events (when `auditEnabled: true`)

### Boundaries

- **No permanent allowlist modification** — approvals are ephemeral (session-scoped). Permanent allowlisting is a separate concern and out of scope.
- **No web UI or CLI** — review happens entirely through OpenClaw tools within the agent conversation.
- **No cross-session persistence** — the backlog is tied to a single agent session. When the session ends, pending requests are discarded.
- **No real-time blocking** — agents do not pause and wait for approval. They continue working and can check the backlog later.
- **No multi-user access control** — v1 assumes a single developer reviewing their own agent's requests.
- **No automatic approval rules** — every request requires explicit human review.

## Non-Goals

- Building a compliance audit trail beyond existing `auditEnabled` logging
- Supporting team-based review workflows with multiple reviewers
- Integrating with external ticketing systems (Jira, Linear, etc.)
- Providing a standalone CLI or web dashboard for request management
- Modifying the core redaction/scanning pipeline behavior

## Risks

- **Storage complexity**: Persisting request state within a plugin that currently has no state management. Mitigation: use a simple in-memory store with optional file-backed persistence.
- **Context leakage**: The backlog stores original PII values alongside redacted placeholders. If the backlog file is accessible, it could leak sensitive data. Mitigation: in-memory by default, file persistence only when explicitly configured, file should be in a temporary/session-scoped location.
- **Agent abuse**: An agent could spam access requests for all redacted entities. Mitigation: configurable rate limit or max pending requests per session.
- **UX friction**: If there are many requests, reviewing them one-by-one via tools could be tedious. Mitigation: batch operations and summary views in the list tool.

## Rollout

- v1 ships as new tools registered by the FogClaw plugin alongside existing tools
- Enabled by default when FogClaw is active (tools are available but do nothing until the agent calls them)
- No migration needed — purely additive to existing functionality
- No configuration required to start using (sensible defaults)

## Validation and Acceptance Signals

- Agent can call the request tool and receive a confirmation with request ID
- User can list pending requests and see entity type, context, and reason
- User can approve a request and the tool returns the original text
- User can deny a request and the tool confirms denial
- User can ask a follow-up question and the agent sees it on next backlog check
- Approved data does not persist beyond the current session
- Audit log captures request lifecycle events when enabled
- Existing scanning and redaction behavior is unaffected

## Requirements

| ID | Priority | Requirement |
|---|---|---|
| R1 | critical | Agent can submit a PII access request via a new tool, providing the redacted placeholder, entity type, and reason for needing access |
| R2 | critical | Requests are stored in a session-scoped backlog with unique IDs, timestamps, and status tracking |
| R3 | critical | User can list all pending requests via a tool, seeing entity type, redacted placeholder, context snippet, and agent's reason |
| R4 | critical | User can approve a request via a tool, which returns the original pre-redaction text as tool output |
| R5 | critical | User can deny a request via a tool, which marks it as denied and informs the agent on next check |
| R6 | high | User can respond to a request with a follow-up question instead of approving/denying |
| R7 | high | Agent can check the backlog for resolved requests and follow-up questions directed at it |
| R8 | high | Backlog is session-scoped — all state is discarded when the session ends |
| R9 | medium | Audit events are emitted for request creation, approval, denial, and follow-up when `auditEnabled: true` |
| R10 | medium | Configurable maximum number of pending requests per session (default: 50) |
| R11 | low | Batch approve/deny multiple requests in a single tool call |

## Chosen Direction

**Tool-based async backlog within the OpenClaw plugin architecture.** The agent creates requests via a tool, the user reviews via tools, and all state lives in-memory for the session. This stays within FogClaw's existing plugin model (hooks + tools) without requiring new infrastructure, external services, or UI surfaces.

## Alternatives Considered

- **Real-time blocking flow** — Agent pauses execution and waits for user approval before continuing. Rejected because it requires synchronous interruption handling that doesn't fit OpenClaw's async plugin model, and creates poor UX when the user isn't actively watching.
- **Permanent allowlist modification on approval** — Approved entities get added to `fogclaw.config.json` allowlist. Rejected because it permanently changes security posture from a one-time approval, creating drift between intended policy and actual behavior.
- **Standalone CLI / web dashboard** — Separate review interface outside OpenClaw. Rejected for v1 because it introduces significant new infrastructure (HTTP server, frontend) and splits the workflow across two surfaces.

## Key Decisions

- **Session-scoped only**: Approved data is returned as tool output in the current conversation and not persisted. This is the safest model — each session starts clean.
- **In-memory storage**: The backlog lives in the plugin's runtime memory. No file I/O by default. This avoids PII leakage via disk and simplifies cleanup.
- **Tools, not hooks**: Request management is implemented as new tools (user-invocable), not hooks (automatic). This keeps the feature opt-in — agents must explicitly request access, and users must explicitly review.

## Open Questions

- **[planning]** **[Affects R1]** How should the request tool receive the original pre-redaction text? The redactor currently returns a mapping of replacements — the request tool needs access to this mapping to fulfill approvals. Needs design during planning.
- **[planning]** **[Affects R7]** What is the exact tool interaction pattern for the agent to check resolved requests? Should it be a separate tool or part of the list tool with a status filter?
- **[planning]** **[Affects R10]** Should rate limiting be per-entity-type or global across all request types?

## Success Criteria

- An agent encountering redacted content can request access and later retrieve the original text after user approval, all within the same session
- The request-review-resolve cycle completes in 3 tool calls or fewer (request → list → resolve)
- No regression in existing scanning, redaction, or hook behavior
- All new tools have comprehensive test coverage (unit + integration)
- Backlog state is fully cleaned up when the session ends (no PII remnants on disk)

## Constraints

- Must work within OpenClaw's plugin tool registration system
- Must not introduce new runtime dependencies beyond what FogClaw already uses
- Must not modify existing tool or hook behavior — purely additive
- Must handle the case where the scanner/redactor is running in regex-only mode (GLiNER unavailable)
- In-memory storage means backlog is lost on process crash — acceptable for v1

## Priority

- priority: high
- rationale: This feature directly addresses a core tension in FogClaw's design (security vs. usability) and differentiates it from simple redaction-only tools. It makes FogClaw practical for real agent workflows where PII access is sometimes necessary.

## Initial Milestone Candidates

- **M1**: Request submission and backlog storage — new `fogclaw_request_access` tool, in-memory backlog store with request lifecycle (pending/approved/denied/follow-up), request metadata schema. Observable outcome: agent can submit a request and get a confirmation ID.
- **M2**: Review and resolution tools — `fogclaw_requests` (list/filter backlog) and `fogclaw_resolve` (approve/deny/follow-up) tools, original text retrieval on approval. Observable outcome: full request-review-resolve cycle works end-to-end.
- **M3**: Integration and polish — audit logging for request events, configurable max pending requests, batch operations, comprehensive test suite, documentation. Observable outcome: feature is production-ready with tests passing and README updated.

## Handoff

Spec is ready for planning. No spike recommended — the approach is straightforward within FogClaw's existing architecture. Proceed to `he-plan` to design the implementation (tool schemas, backlog data model, integration with existing redactor mapping).

## Revision Notes

- 2026-02-17T00:00:00Z: Initialized spec from intake. Reason: establish baseline for PII access request backlog feature.
