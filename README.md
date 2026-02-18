# FogClaw

An [OpenClaw](https://github.com/openclaw/openclaw) plugin for PII detection and custom entity redaction, powered by [DataFog](https://github.com/datafog/datafog-python).

FogClaw uses a dual-engine approach: battle-tested regex patterns for structured PII (emails, SSNs, credit cards, etc.) and [GLiNER](https://github.com/urchade/GLiNER) via ONNX for zero-shot named entity recognition — letting you redact not just PII but any custom terms, expressions, or entity types you define.

## Features

- **Three-layer scanning** — inbound prompts, tool results, and outbound messages are all scanned for PII before they cross trust boundaries
- **Automatic guardrail** — intercepts messages before they reach the LLM via OpenClaw's `before_agent_start` hook
- **Tool result scanning** — redacts PII in file reads, API responses, and web fetches before they enter the session transcript (`tool_result_persist`)
- **Outbound message scanning** — last-chance gate that catches PII in agent replies before delivery to external channels (`message_sending`)
- **On-demand tools** — `fogclaw_scan`, `fogclaw_preview`, and `fogclaw_redact`
- **Dual detection engine** — regex for structured PII (<1ms), GLiNER for zero-shot NER (~50-200ms)
- **Custom entity types** — define any entity label (e.g., "project codename", "competitor name") and GLiNER detects them with zero training
- **Configurable actions** — per-entity-type behavior: `redact`, `block`, or `warn`
- **Per-entity confidence tuning** — tighten or relax detection confidence by label
- **Policy allowlist** — whitelist exact strings or regex patterns to skip enforcement on known-safe values
- **Policy preview** — run a dry-run simulation before changing runtime policy
- **Multiple redaction strategies** — `token`, `mask`, or `hash`
- **Audit trail summary logging** — optional structured action summaries without logging raw entity content
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

### GLiNER first-run setup (no extra steps)

FogClaw automatically downloads the GLiNER ONNX model on first run if it is not already cached locally, then reuses it for all later starts.

What happens on first scan:

1. Tokenizers are downloaded (if needed).
2. The first available ONNX file from Hugging Face is downloaded to the plugin's local model cache:
   - `.../node_modules/@xenova/transformers/.cache/<model-repo>/onnx/<selected-model>.onnx`
   - (This download can take a moment depending on network and selected model size.)
3. GLiNER starts using local files, so later runs stay fast and offline-friendly.

If the download cannot be performed (network/firewall/auth), FogClaw safely falls back to regex-only mode and continues to protect common structured PII.

If your network requires Hugging Face authentication, export `HF_TOKEN` or `HF_ACCESS_TOKEN` before starting OpenClaw so model files can download.

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
  "entityConfidenceThresholds": {
    "PERSON": 0.6,
    "ORGANIZATION": 0.7
  },
  "custom_entities": ["project codename", "competitor name"],
  "entityActions": {
    "SSN": "block",
    "CREDIT_CARD": "block",
    "EMAIL": "redact",
    "PHONE": "redact",
    "PERSON": "warn"
  },
  "allowlist": {
    "values": ["noreply@example.com"],
    "patterns": ["^internal-"],
    "entities": {
      "PERSON": ["john doe"]
    }
  },
  "auditEnabled": true
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
 +-----------+
       |
       v
 +-----------+
 | Merge &   |  deduplicate overlapping spans, prefer higher confidence
 | Normalize |
 +-----------+
       |
       v
  Apply action per entity type (redact / block / warn)
```

## Scanning Architecture

FogClaw hooks into three points in the OpenClaw message lifecycle. Each hook uses the detection engine best suited to its runtime constraints:

| Hook | Direction | Engine | Latency | Async | Entity Coverage |
|------|-----------|--------|---------|-------|-----------------|
| `before_agent_start` | Inbound (user prompt) | Regex + GLiNER | ~50-200ms | Yes | Full — structured PII + names, orgs, custom entities |
| `tool_result_persist` | Internal (tool results) | Regex only | <1ms | No (sync) | Structured PII — emails, SSNs, phones, credit cards, IPs |
| `message_sending` | Outbound (agent reply) | Regex + GLiNER | ~50-200ms | Yes | Full — structured PII + names, orgs, custom entities |

**Why regex-only for tool results?** OpenClaw's `tool_result_persist` hook requires synchronous handlers — async returns are rejected. GLiNER inference runs a synchronous ONNX native call that blocks the event loop for 100-500ms per invocation, which would degrade gateway responsiveness (delayed heartbeats, WebSocket pings, HTTP responses). Regex covers the high-confidence structured patterns most common in tool output (credentials in file reads, contact info in API responses). Person names and organization names are caught on the async inbound and outbound paths, providing defense-in-depth without hot-path latency.

```
User prompt ──► before_agent_start (regex + GLiNER)
                        │
                        ▼
                   Agent + LLM
                        │
              ┌─────────┼─────────┐
              ▼         ▼         ▼
         Tool call  Tool call  Tool call
              │         │         │
              ▼         ▼         ▼
     tool_result_persist (regex only, sync)
                        │
                        ▼
                   Agent reply
                        │
                        ▼
              message_sending (regex + GLiNER)
                        │
                        ▼
                  External channel
              (Telegram, Slack, etc.)
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
| `model` | `string` | `"onnx-community/gliner_large-v2.1"` | HuggingFace model path for GLiNER (or a local `.onnx` path for advanced setups). |
| `confidence_threshold` | `number` | `0.5` | Minimum confidence for GLiNER detections (0-1) |
| `entityConfidenceThresholds` | `object` | `{}` | Per-label confidence overrides, e.g. `{ "PERSON": 0.7, "ORGANIZATION": 0.85 }` |
| `custom_entities` | `string[]` | `[]` | Custom entity labels for zero-shot detection |
| `entityActions` | `object` | `{}` | Per-entity-type action overrides |
| `allowlist` | `object` | `{}` | Exception rules to skip enforcement via exact values or regex patterns |
| `auditEnabled` | `boolean` | `true` | Emit structured audit logs for guardrail decisions |

## OpenClaw Tools

### `fogclaw_scan`

Scan text for PII and custom entities. Returns detected entities with types, positions, and confidence scores.

**Parameters:**
- `text` (required) — text to scan
- `custom_labels` (optional) — additional entity labels for zero-shot detection

### `fogclaw_preview`

Preview what the guardrail would do for a message.

**Parameters:**
- `text` (required) — text to simulate
- `strategy` (optional) — `"token"`, `"mask"`, or `"hash"` (defaults to config)
- `custom_labels` (optional) — additional entity labels for zero-shot detection

**Response:**
- `entities`: detected entities and metadata
- `totalEntities`: total entities found
- `actionPlan`: counts and labels grouped by `blocked`, `warned`, `redacted`
- `redactedText`: message with only redacted entities applied

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

## Security Notes

- Keep `api.logger` output free of raw sensitive values.
- Use allowlists and `auditEnabled` according to your governance requirements.
- Consider `block` actions for high-risk entity types in regulated environments.

## License

MIT
