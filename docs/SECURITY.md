---
title: "Security"
use_when: "Capturing security expectations for this repo: threat model, auth/authorization, data sensitivity, compliance, and required controls."
---

## Threat Model

FogClaw processes text from two surfaces: user prompts (`before_agent_start`) and tool results (`tool_result_persist`). Both may contain PII. The main risks are:

1. **PII leaking through unscanned paths.** Any text surface that FogClaw does not hook into is a gap. Currently covered: user prompts and tool results. Not yet covered: outbound messages (`message_sending`), historical messages, compacted summaries.
2. **Redaction logic errors.** If redaction produces malformed output (e.g., offset miscalculation), original PII spans could leak through or be partially visible.
3. **Accidental PII in logs/errors.** Audit entries, error messages, and crash output must never contain raw PII values.
4. **Regex false negatives.** The synchronous tool result path uses regex-only detection. Edge-case PII formats (international phone numbers, non-standard SSN formatting) may not match.
5. **GLiNER unavailability.** If the ONNX model fails to load, the prompt-level scanner degrades to regex-only mode silently. Users may not realize unstructured entities (names, organizations) are not being detected.

## Auth Model

This package does not implement authentication itself. It is a plugin loaded by OpenClaw, and security is enforced by OpenClaw’s plugin installation and runtime controls.

Within this repo, this means:

- No custom auth credentials are accepted.
- No authorization checks are added in the plugin itself.
- Sensitive behavior is controlled by config and explicit runtime policy (`redact`, `warn`, `block`).

## Data Sensitivity

Treat plugin input as sensitive by default.

- PII and custom entities are parsed from incoming messages.
- Entity text is held in memory during scan and redaction only.
- Do not write raw messages, detected entity values, or redaction mappings to disk.
- Prefer hash or token strategies when persistence is required by caller policy.

## Compliance

This plugin is scoped as an on-device plugin. It does not claim HIPAA, GDPR, or SOC 2 compliance by itself.

At minimum, callers should classify whether their usage has regulated data and enforce policy at the platform level (retention, purge, and audit).

## Controls

- Keep `api.logger` and local logs free of entity values.
- Never store scan results in global caches.
- Preserve plugin fallback behavior: if GLiNER initialization fails, continue in regex-only mode and do not fail the entire request path.
- Enforce the plugin-level switch (`enabled`) to allow safe disablement without process restart if needed.

## OpenClaw-Specific Security Notes

- Use clean plugin configuration.
- Restrict plugin installation and publishing channels to trusted owners.
- In reviews, verify `openclaw.plugin.json` and package metadata before listing; mismatched package identity can create install ambiguity.
