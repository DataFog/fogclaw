---
title: "Security"
use_when: "Capturing security expectations for this repo: threat model, auth/authorization, data sensitivity, compliance, and required controls."
---

## Threat Model

FogClaw processes user-provided prompt text and returns extracted entities with character offsets. The main risk is accidental exposure of sensitive information in logs, crash output, or plugin responses.

Assume untrusted text arrives from user messages.

For this repo, a concrete threat is that PII can appear in plain text and be reflected back in a wrong form (for example, redacted text leaking original spans) if redaction logic or logging is incorrect.

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
