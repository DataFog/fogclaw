# FogClaw

An [OpenClaw](https://github.com/openclaw/openclaw) plugin for PII detection and custom entity redaction, powered by [DataFog](https://github.com/datafog/datafog-python).

FogClaw uses a dual-engine approach: battle-tested regex patterns for structured PII (emails, SSNs, credit cards, etc.) and [GLiNER](https://github.com/urchade/GLiNER) via ONNX for zero-shot named entity recognition — letting you redact not just PII but any custom terms, expressions, or entity types you define.

## Features

- **Automatic guardrail** — intercepts messages before they reach the LLM via OpenClaw's `before_agent_start` hook
- **On-demand tools** — `fogclaw_scan` and `fogclaw_redact` tools the agent can invoke explicitly
- **Dual detection engine** — regex for structured PII (<1ms), GLiNER for zero-shot NER (~50-200ms)
- **Custom entity types** — define any entity label (e.g., "project codename", "competitor name") and GLiNER detects them with zero training
- **Configurable actions** — per-entity-type behavior: `redact`, `block`, or `warn`
- **Multiple redaction strategies** — `token`, `mask`, or `hash`
- **Graceful degradation** — falls back to regex-only mode if GLiNER fails to load

## Installation

```bash
# From the OpenClaw CLI
openclaw plugins install @datafog/fogclaw

# Or manually
git clone https://github.com/DataFog/fogclaw.git ~/.openclaw/extensions/fogclaw
cd ~/.openclaw/extensions/fogclaw
npm install
npm run build
```

## Quick Start

1. Copy the example config:

```bash
cp fogclaw.config.example.json fogclaw.config.json
```

2. Edit `fogclaw.config.json` to your needs:

```json
{
  "enabled": true,
  "guardrail_mode": "redact",
  "redactStrategy": "token",
  "model": "onnx-community/gliner_large-v2.1",
  "confidence_threshold": 0.5,
  "custom_entities": ["project codename", "competitor name"],
  "entityActions": {
    "SSN": "block",
    "CREDIT_CARD": "block",
    "EMAIL": "redact",
    "PHONE": "redact",
    "PERSON": "warn"
  }
}
```

3. Enable the plugin in your OpenClaw config and restart.

## Submission Readiness Evidence (Recommended)

These commands are the minimum evidence set for PR review:

```bash
npm test
npm run build
npm run test:plugin-smoke
npm pkg get openclaw
npm run build
node - <<'NODE'
import plugin from './dist/index.js';
const result = plugin.register ? 'ok' : 'missing-register';
console.log(result, plugin.id, plugin.name);
NODE
```

Expected output:

- All tests pass.
- `npm run build` exits with `0` and writes `dist/index.js`.
- `npm run test:plugin-smoke` passes and confirms hook/tool contracts.
- `npm pkg get openclaw` shows `{"extensions":["./dist/index.js"]}`.
- The inline node check prints `ok fogclaw FogClaw`.

## How It Works

```
Incoming message
       |
       v
 +-----------+
 | Regex Pass |  emails, SSNs, phones, credit cards, IPs, dates, zips
 |  (<1ms)    |  confidence: 1.0
 +-----+-----+
       |
       v
 +-----------+
 | GLiNER    |  persons, orgs, locations + your custom entities
 |  (ONNX)   |  confidence: 0.0-1.0
 +-----+-----+
       |
       v
 +-----------+
 | Merge &   |  deduplicate overlapping spans, prefer higher confidence
 | Normalize |
 +-----+-----+
       |
       v
  Apply action per entity type (redact / block / warn)
```

## Detected Entity Types

### Regex Engine (structured PII)

| Type | Examples |
|------|----------|
| `EMAIL` | `john@example.com`, `user+tag@example.co.uk` |
| `PHONE` | `555-123-4567`, `(555) 123-4567`, `+44 20 7946 0958` |
| `SSN` | `123-45-6789` |
| `CREDIT_CARD` | Visa, Mastercard, Amex (with/without separators) |
| `IP_ADDRESS` | `192.168.1.1`, `10.0.0.1` |
| `DATE` | `01/15/1990`, `2020-01-15`, `January 15, 2000` |
| `ZIP_CODE` | `10001`, `10001-1234` |

### GLiNER Engine (zero-shot NER)

Built-in labels: `person`, `organization`, `location`, `address`, `date of birth`, `medical record number`, `account number`, `passport number`

Plus any labels you add via `custom_entities` in the config.

## Redaction Strategies

| Strategy | Input | Output |
|----------|-------|--------|
| `token` | `Contact john@example.com` | `Contact [EMAIL_1]` |
| `mask` | `Contact john@example.com` | `Contact ****************` |
| `hash` | `Contact john@example.com` | `Contact [EMAIL_a1b2c3d4e5f6]` |

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable/disable the plugin |
| `guardrail_mode` | `string` | `"redact"` | Default action: `"redact"`, `"block"`, or `"warn"` |
| `redactStrategy` | `string` | `"token"` | How to redact: `"token"`, `"mask"`, or `"hash"` |
| `model` | `string` | `"onnx-community/gliner_large-v2.1"` | HuggingFace model path for GLiNER |
| `confidence_threshold` | `number` | `0.5` | Minimum confidence for GLiNER detections (0-1) |
| `custom_entities` | `string[]` | `[]` | Custom entity labels for zero-shot detection |
| `entityActions` | `object` | `{}` | Per-entity-type action overrides |

## OpenClaw Tools

### `fogclaw_scan`

Scan text for PII and custom entities. Returns detected entities with types, positions, and confidence scores.

**Parameters:**
- `text` (required) — text to scan
- `custom_labels` (optional) — additional entity labels for zero-shot detection

### `fogclaw_redact`

Scan and redact PII/custom entities from text. Returns sanitized text with entities replaced.

**Parameters:**
- `text` (required) — text to scan and redact
- `strategy` (optional) — `"token"`, `"mask"`, or `"hash"` (defaults to config)
- `custom_labels` (optional) — additional entity labels for zero-shot detection

## Standalone Usage

FogClaw's core can also be used outside of OpenClaw:

```typescript
import { Scanner, redact, loadConfig, DEFAULT_CONFIG } from "@datafog/fogclaw";

const scanner = new Scanner(DEFAULT_CONFIG);
await scanner.initialize();

// Scan for entities
const result = await scanner.scan("Contact john@example.com or call 555-123-4567");
console.log(result.entities);
// [
//   { text: "john@example.com", label: "EMAIL", start: 8, end: 24, confidence: 1, source: "regex" },
//   { text: "555-123-4567", label: "PHONE", start: 33, end: 45, confidence: 1, source: "regex" }
// ]

// Redact
const redacted = redact(result.text, result.entities, "token");
console.log(redacted.redacted_text);
// "Contact [EMAIL_1] or call [PHONE_1]"
```

## Development

```bash
git clone https://github.com/DataFog/fogclaw.git
cd fogclaw
npm install
npm test          # run tests
npm run build     # compile TypeScript
npm run lint      # type-check without emitting
```

## License

MIT
