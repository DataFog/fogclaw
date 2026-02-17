# FogClaw Design Document

**Date:** 2026-02-16
**Repo:** `datafog/fogclaw` (public, MIT license)
**Status:** Approved

## Overview

FogClaw is an OpenClaw plugin that brings DataFog's PII detection and redaction capabilities into the OpenClaw AI agent ecosystem. It acts as both a passive guardrail on message flow and an on-demand tool the agent can invoke explicitly. It uses a dual-engine approach: ported DataFog regex patterns for structured PII and GLiNER (via ONNX) for zero-shot NER on custom entities.

## Decisions

| Decision | Choice |
|---|---|
| Use case | Both guardrail + on-demand tool |
| Language | Pure TypeScript (ONNX for GLiNER) |
| Regex layer | Port DataFog regex patterns |
| PII action | Configurable per-entity-type (default: redact) |
| Custom terms | Config file (`fogclaw.config.json`) |
| Default model | `onnx-community/gliner_large-v2.1` |
| Architecture | Dual-layer (regex + GLiNER) |

## Project Structure

```
fogclaw/
├── openclaw.plugin.json          # OpenClaw plugin manifest
├── package.json
├── tsconfig.json
├── fogclaw.config.example.json   # Example user config
├── src/
│   ├── index.ts                  # Plugin entry: register hook + tool
│   ├── engines/
│   │   ├── regex.ts              # Ported DataFog regex patterns
│   │   └── gliner.ts             # GLiNER ONNX inference wrapper
│   ├── scanner.ts                # Orchestrator: regex → GLiNER pipeline
│   ├── redactor.ts               # Redaction strategies (token, mask, hash)
│   ├── config.ts                 # Config loading & validation
│   └── types.ts                  # Shared TypeScript types
├── models/                       # Auto-downloaded ONNX model cache
├── tests/
│   ├── regex.test.ts
│   ├── gliner.test.ts
│   ├── scanner.test.ts
│   └── redactor.test.ts
└── README.md
```

## Detection Pipeline

```
Input text
    │
    ▼
┌─────────────┐
│  Regex Pass  │  ← emails, SSNs, phones, credit cards, IPs, dates, zips
│  (~20µs/kB)  │     confidence: 1.0
└─────┬───────┘
      │
      ▼
┌─────────────┐
│ GLiNER Pass  │  ← persons, orgs, locations + custom entities from config
│  (ONNX)      │     confidence: 0.0-1.0
└─────┬───────┘
      │
      ▼
┌─────────────┐
│   Merge &    │  ← Deduplicate overlapping spans, prefer higher confidence
│  Normalize   │     Canonical type mapping (same as DataFog)
└─────┬───────┘
      │
      ▼
  Entity[] — unified results
```

### Entity Type

```typescript
interface Entity {
  text: string;        // "john@example.com"
  label: string;       // "EMAIL"
  start: number;       // character offset
  end: number;
  confidence: number;  // 1.0 for regex, 0.0-1.0 for GLiNER
  source: "regex" | "gliner";
}
```

### Span Conflict Resolution

When regex and GLiNER detect overlapping spans, prefer regex (confidence 1.0) for structured types, GLiNER for semantic types. Partially overlapping spans resolved by higher confidence.

### GLiNER Labels

Built-in: `["person", "organization", "location", "address", "date of birth", "medical record number", "account number", "passport number"]`

Plus `custom_entities` from user config.

## OpenClaw Integration

### Hook (Guardrail)

Registers `before_agent_start` hook to intercept incoming messages. Per-entity-type actions:
- **redact**: Replace with tokens like `[EMAIL]` (default)
- **block**: Stop message, notify user
- **warn**: Notify but allow message through

### Tools

Two tools registered for on-demand use by the agent:

1. **fogclaw_scan** — Detect entities in text, return structured results
2. **fogclaw_redact** — Detect and redact entities, return sanitized text

Both accept optional `custom_labels` parameter for ad-hoc zero-shot entity detection.

### Redaction Strategies

- **token**: `"Contact john@example.com"` → `"Contact [EMAIL]"`
- **mask**: `"Contact john@example.com"` → `"Contact ****************"`
- **hash**: `"Contact john@example.com"` → `"Contact [EMAIL_a1b2c3d4e5f6]"`

## Configuration

```json
{
  "enabled": true,
  "guardrail_mode": "redact",
  "redactStrategy": "token",
  "model": "onnx-community/gliner_large-v2.1",
  "confidence_threshold": 0.5,
  "custom_entities": ["project codename", "internal tool name", "competitor name"],
  "entityActions": {
    "SSN": "block",
    "CREDIT_CARD": "block",
    "EMAIL": "redact",
    "PHONE": "redact",
    "PERSON": "warn"
  }
}
```

## Dependencies

```json
{
  "dependencies": {
    "gliner": "^0.x.x",
    "onnxruntime-node": "^1.x"
  },
  "devDependencies": {
    "vitest": "^2.x",
    "typescript": "^5.x"
  }
}
```

## Technical Considerations

**Model Loading:** Downloaded once from HuggingFace, cached in `~/.openclaw/extensions/fogclaw/models/`. Singleton pattern — stays loaded after first inference.

**Error Handling:** GLiNER failure → fall back to regex-only with warning. Network failure during download → clear error with manual download instructions.

**Performance:** Regex <1ms, GLiNER ~50-200ms per message. Well under 1s total — acceptable for messaging bots.

## Not In v1 (YAGNI)

- No outbound message scanning
- No persistent audit log
- No web UI for config
- No GLiNER2 support (add later when npm ecosystem catches up)
- No runtime entity label management (config file only)
