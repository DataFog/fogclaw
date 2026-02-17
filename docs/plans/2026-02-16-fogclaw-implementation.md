# FogClaw Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a pure TypeScript OpenClaw plugin that detects and redacts PII + custom entities using regex and GLiNER ONNX, exposed as both a message guardrail and an on-demand agent tool.

**Architecture:** Dual-engine pipeline (regex first for structured PII, GLiNER second for zero-shot NER) in a single OpenClaw plugin that registers a `before_agent_start` hook and two tools (`fogclaw_scan`, `fogclaw_redact`). Config-driven per-entity-type actions.

**Tech Stack:** TypeScript, Node.js 22+, vitest, `gliner` npm package, `onnxruntime-node`, OpenClaw plugin API.

**Design doc:** `docs/plans/2026-02-16-fogclaw-design.md`

---

### Task 1: Repository Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `openclaw.plugin.json`
- Create: `fogclaw.config.example.json`
- Create: `src/types.ts`

**Step 1: Initialize the repo**

Create the GitHub repo under the `datafog` org:

```bash
mkdir fogclaw && cd fogclaw
git init
```

**Step 2: Create `package.json`**

```json
{
  "name": "@datafog/fogclaw",
  "version": "0.1.0",
  "description": "OpenClaw plugin for PII detection & custom entity redaction powered by DataFog",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "gliner": "^0.2.0",
    "onnxruntime-node": "^1.20.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  },
  "engines": {
    "node": ">=22.0.0"
  },
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/datafog/fogclaw"
  }
}
```

**Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Step 4: Create `.gitignore`**

```
node_modules/
dist/
models/
*.onnx
.env
```

**Step 5: Create `openclaw.plugin.json`**

```json
{
  "id": "fogclaw",
  "name": "FogClaw",
  "version": "0.1.0",
  "description": "PII detection & custom entity redaction powered by DataFog",
  "configSchema": {
    "type": "object",
    "properties": {
      "enabled": { "type": "boolean", "default": true },
      "guardrail_mode": {
        "type": "string",
        "enum": ["redact", "block", "warn"],
        "default": "redact"
      },
      "redactStrategy": {
        "type": "string",
        "enum": ["token", "mask", "hash"],
        "default": "token"
      },
      "model": {
        "type": "string",
        "default": "onnx-community/gliner_large-v2.1"
      },
      "confidence_threshold": {
        "type": "number",
        "default": 0.5,
        "minimum": 0,
        "maximum": 1
      },
      "custom_entities": {
        "type": "array",
        "items": { "type": "string" },
        "default": []
      },
      "entityActions": {
        "type": "object",
        "additionalProperties": {
          "type": "string",
          "enum": ["redact", "block", "warn"]
        },
        "default": {}
      }
    }
  }
}
```

**Step 6: Create `fogclaw.config.example.json`**

```json
{
  "enabled": true,
  "guardrail_mode": "redact",
  "redactStrategy": "token",
  "model": "onnx-community/gliner_large-v2.1",
  "confidence_threshold": 0.5,
  "custom_entities": ["project codename", "internal tool name"],
  "entityActions": {
    "SSN": "block",
    "CREDIT_CARD": "block",
    "EMAIL": "redact",
    "PHONE": "redact",
    "PERSON": "warn"
  }
}
```

**Step 7: Create `src/types.ts`**

```typescript
export interface Entity {
  text: string;
  label: string;
  start: number;
  end: number;
  confidence: number;
  source: "regex" | "gliner";
}

export type RedactStrategy = "token" | "mask" | "hash";

export type GuardrailAction = "redact" | "block" | "warn";

export interface FogClawConfig {
  enabled: boolean;
  guardrail_mode: GuardrailAction;
  redactStrategy: RedactStrategy;
  model: string;
  confidence_threshold: number;
  custom_entities: string[];
  entityActions: Record<string, GuardrailAction>;
}

export interface ScanResult {
  entities: Entity[];
  text: string;
}

export interface RedactResult {
  redacted_text: string;
  mapping: Record<string, string>;
  entities: Entity[];
}

export const CANONICAL_TYPE_MAP: Record<string, string> = {
  DOB: "DATE",
  ZIP: "ZIP_CODE",
  PER: "PERSON",
  ORG: "ORGANIZATION",
  GPE: "LOCATION",
  LOC: "LOCATION",
  FAC: "ADDRESS",
  PHONE_NUMBER: "PHONE",
  SOCIAL_SECURITY_NUMBER: "SSN",
  CREDIT_CARD_NUMBER: "CREDIT_CARD",
  DATE_OF_BIRTH: "DATE",
};

export function canonicalType(entityType: string): string {
  const normalized = entityType.toUpperCase().trim();
  return CANONICAL_TYPE_MAP[normalized] ?? normalized;
}
```

**Step 8: Install dependencies & verify build**

```bash
npm install
npx tsc --noEmit
```

Expected: Clean compile, no errors.

**Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold fogclaw repo with types, config, and plugin manifest"
```

---

### Task 2: Regex Engine

**Files:**
- Create: `src/engines/regex.ts`
- Create: `tests/regex.test.ts`

**Step 1: Write the failing tests**

Create `tests/regex.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { RegexEngine } from "../src/engines/regex.js";

const engine = new RegexEngine();

describe("RegexEngine", () => {
  describe("EMAIL", () => {
    it("detects simple email", () => {
      const entities = engine.scan("Contact john@example.com for info");
      const emails = entities.filter((e) => e.label === "EMAIL");
      expect(emails).toHaveLength(1);
      expect(emails[0].text).toBe("john@example.com");
      expect(emails[0].confidence).toBe(1.0);
      expect(emails[0].source).toBe("regex");
    });

    it("detects email with subdomain", () => {
      const entities = engine.scan("Email first.last@example.co.uk");
      const emails = entities.filter((e) => e.label === "EMAIL");
      expect(emails).toHaveLength(1);
      expect(emails[0].text).toBe("first.last@example.co.uk");
    });

    it("detects email with plus tag", () => {
      const entities = engine.scan("Send to user+tag@example.org");
      const emails = entities.filter((e) => e.label === "EMAIL");
      expect(emails).toHaveLength(1);
    });

    it("does not match bare @", () => {
      const entities = engine.scan("@ is not an email");
      const emails = entities.filter((e) => e.label === "EMAIL");
      expect(emails).toHaveLength(0);
    });
  });

  describe("PHONE", () => {
    it("detects US phone with dashes", () => {
      const entities = engine.scan("Call 555-123-4567");
      const phones = entities.filter((e) => e.label === "PHONE");
      expect(phones).toHaveLength(1);
      expect(phones[0].text).toBe("555-123-4567");
    });

    it("detects US phone with parens", () => {
      const entities = engine.scan("Call (555) 123-4567");
      const phones = entities.filter((e) => e.label === "PHONE");
      expect(phones).toHaveLength(1);
    });

    it("detects international phone", () => {
      const entities = engine.scan("Call +44 20 7946 0958");
      const phones = entities.filter((e) => e.label === "PHONE");
      expect(phones).toHaveLength(1);
    });
  });

  describe("SSN", () => {
    it("detects SSN with dashes", () => {
      const entities = engine.scan("SSN: 123-45-6789");
      const ssns = entities.filter((e) => e.label === "SSN");
      expect(ssns).toHaveLength(1);
      expect(ssns[0].text).toBe("123-45-6789");
    });

    it("rejects SSN with area code 000", () => {
      const entities = engine.scan("SSN: 000-45-6789");
      const ssns = entities.filter((e) => e.label === "SSN");
      expect(ssns).toHaveLength(0);
    });

    it("rejects SSN with area code 666", () => {
      const entities = engine.scan("SSN: 666-45-6789");
      const ssns = entities.filter((e) => e.label === "SSN");
      expect(ssns).toHaveLength(0);
    });
  });

  describe("CREDIT_CARD", () => {
    it("detects Visa", () => {
      const entities = engine.scan("Card: 4111111111111111");
      const cards = entities.filter((e) => e.label === "CREDIT_CARD");
      expect(cards).toHaveLength(1);
    });

    it("detects Mastercard", () => {
      const entities = engine.scan("Card: 5500000000000004");
      const cards = entities.filter((e) => e.label === "CREDIT_CARD");
      expect(cards).toHaveLength(1);
    });

    it("detects Amex", () => {
      const entities = engine.scan("Card: 340000000000009");
      const cards = entities.filter((e) => e.label === "CREDIT_CARD");
      expect(cards).toHaveLength(1);
    });
  });

  describe("IP_ADDRESS", () => {
    it("detects valid IPv4", () => {
      const entities = engine.scan("Server at 192.168.1.1");
      const ips = entities.filter((e) => e.label === "IP_ADDRESS");
      expect(ips).toHaveLength(1);
      expect(ips[0].text).toBe("192.168.1.1");
    });

    it("rejects invalid octet", () => {
      const entities = engine.scan("Not valid: 256.168.1.1");
      const ips = entities.filter((e) => e.label === "IP_ADDRESS");
      expect(ips).toHaveLength(0);
    });
  });

  describe("DATE", () => {
    it("detects MM/DD/YYYY", () => {
      const entities = engine.scan("Born on 01/15/1990");
      const dates = entities.filter((e) => e.label === "DATE");
      expect(dates).toHaveLength(1);
    });

    it("detects YYYY-MM-DD", () => {
      const entities = engine.scan("Date: 2020-01-15");
      const dates = entities.filter((e) => e.label === "DATE");
      expect(dates).toHaveLength(1);
    });

    it("detects Month DD, YYYY", () => {
      const entities = engine.scan("Born January 15, 2000");
      const dates = entities.filter((e) => e.label === "DATE");
      expect(dates).toHaveLength(1);
    });
  });

  describe("ZIP_CODE", () => {
    it("detects 5-digit zip", () => {
      const entities = engine.scan("ZIP: 10001");
      const zips = entities.filter((e) => e.label === "ZIP_CODE");
      expect(zips).toHaveLength(1);
    });

    it("detects zip+4", () => {
      const entities = engine.scan("ZIP: 10001-1234");
      const zips = entities.filter((e) => e.label === "ZIP_CODE");
      expect(zips).toHaveLength(1);
    });
  });

  describe("multiple entities", () => {
    it("detects multiple entity types in one text", () => {
      const text =
        "John's email is john@example.com, phone 555-123-4567, SSN 123-45-6789";
      const entities = engine.scan(text);
      const labels = new Set(entities.map((e) => e.label));
      expect(labels.has("EMAIL")).toBe(true);
      expect(labels.has("PHONE")).toBe(true);
      expect(labels.has("SSN")).toBe(true);
    });
  });

  describe("empty input", () => {
    it("returns empty array for empty string", () => {
      const entities = engine.scan("");
      expect(entities).toHaveLength(0);
    });
  });

  describe("span offsets", () => {
    it("returns correct start/end offsets", () => {
      const text = "Email: john@example.com here";
      const entities = engine.scan(text);
      const email = entities.find((e) => e.label === "EMAIL")!;
      expect(text.slice(email.start, email.end)).toBe("john@example.com");
    });
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/regex.test.ts
```

Expected: FAIL — `Cannot find module '../src/engines/regex.js'`

**Step 3: Write the regex engine**

Create `src/engines/regex.ts`:

```typescript
import type { Entity } from "../types.js";

interface PatternDef {
  label: string;
  pattern: RegExp;
  /** Canonical label to use in output (e.g., DOB → DATE) */
  canonicalLabel?: string;
}

const PATTERNS: PatternDef[] = [
  {
    label: "EMAIL",
    pattern:
      /(?<![A-Za-z0-9._%+\-@])(?![A-Za-z_]{2,20}=)[A-Za-z0-9!#$%&*+\-/=^_`{|}~][A-Za-z0-9!#$%&'*+\-/=?^_`{|}~.]*@(?:\.?[A-Za-z0-9-]+\.)+[A-Za-z]{2,}(?=$|[^A-Za-z])/gim,
  },
  {
    label: "PHONE",
    pattern:
      /(?<![A-Za-z0-9])(?:(?:(?:\+?1)[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}|\+\d{1,3}[\s\-.]?\d{1,4}(?:[\s\-.]?\d{2,4}){2,3})(?![-A-Za-z0-9])/gim,
  },
  {
    label: "SSN",
    pattern:
      /(?<!\d)(?:(?!000|666)\d{3}-(?!00)\d{2}-(?!0000)\d{4}|(?!000|666)\d{3}(?!00)\d{2}(?!0000)\d{4})(?!\d)/gm,
  },
  {
    label: "CREDIT_CARD",
    pattern:
      /\b(?:4\d{12}(?:\d{3})?|5[1-5]\d{14}|3[47]\d{13}|(?:(?:4\d{3}|5[1-5]\d{2}|3[47]\d{2})[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4})|(?:3[47]\d{2}[-\s]?\d{6}[-\s]?\d{5}))\b/gm,
  },
  {
    label: "IP_ADDRESS",
    pattern:
      /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.(?:25[0-5]|2[0-4]\d|1?\d?\d)\.(?:25[0-5]|2[0-4]\d|1?\d?\d)\.(?:25[0-5]|2[0-4]\d|1?\d?\d))\b/gm,
  },
  {
    label: "DATE",
    canonicalLabel: "DATE",
    pattern:
      /\b(?:(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])[/-](?:\d{2}|\d{4})|(?:\d{4})-(?:0?[1-9]|1[0-2])-(?:0?[1-9]|[12]\d|3[01])|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(?:0?[1-9]|[12]\d|3[01]),\s+(?:19|20)\d{2})\b/gim,
  },
  {
    label: "ZIP_CODE",
    pattern: /\b\d{5}(?:-\d{4})?\b/gm,
  },
];

export class RegexEngine {
  scan(text: string): Entity[] {
    if (!text) return [];

    const entities: Entity[] = [];

    for (const { label, pattern, canonicalLabel } of PATTERNS) {
      // Reset lastIndex since we reuse the regex
      pattern.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        entities.push({
          text: match[0],
          label: canonicalLabel ?? label,
          start: match.index,
          end: match.index + match[0].length,
          confidence: 1.0,
          source: "regex",
        });
      }
    }

    return entities;
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/regex.test.ts
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/engines/regex.ts tests/regex.test.ts
git commit -m "feat: add regex engine with ported DataFog PII patterns"
```

---

### Task 3: Redactor

**Files:**
- Create: `src/redactor.ts`
- Create: `tests/redactor.test.ts`

**Step 1: Write the failing tests**

Create `tests/redactor.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { redact } from "../src/redactor.js";
import type { Entity } from "../src/types.js";

const email: Entity = {
  text: "john@example.com",
  label: "EMAIL",
  start: 8,
  end: 24,
  confidence: 1.0,
  source: "regex",
};

const phone: Entity = {
  text: "555-123-4567",
  label: "PHONE",
  start: 32,
  end: 44,
  confidence: 1.0,
  source: "regex",
};

const baseText = "Contact john@example.com, call 555-123-4567 please";

describe("redact", () => {
  describe("token strategy", () => {
    it("replaces entities with type tokens", () => {
      const result = redact(baseText, [email, phone], "token");
      expect(result.redacted_text).toContain("[EMAIL_1]");
      expect(result.redacted_text).toContain("[PHONE_1]");
      expect(result.redacted_text).not.toContain("john@example.com");
      expect(result.redacted_text).not.toContain("555-123-4567");
    });

    it("increments counter for same type", () => {
      const email2: Entity = {
        text: "jane@example.com",
        label: "EMAIL",
        start: 30,
        end: 46,
        confidence: 1.0,
        source: "regex",
      };
      const text = "Email john@example.com and also jane@example.com";
      const result = redact(text, [
        { ...email, start: 6, end: 22 },
        { ...email2 },
      ], "token");
      expect(result.redacted_text).toContain("[EMAIL_1]");
      expect(result.redacted_text).toContain("[EMAIL_2]");
    });

    it("builds mapping from replacement to original", () => {
      const result = redact(baseText, [email], "token");
      expect(result.mapping["[EMAIL_1]"]).toBe("john@example.com");
    });
  });

  describe("mask strategy", () => {
    it("replaces with asterisks matching length", () => {
      const result = redact("Contact john@example.com", [
        { ...email, start: 8, end: 24 },
      ], "mask");
      expect(result.redacted_text).toBe("Contact ****************");
    });
  });

  describe("hash strategy", () => {
    it("replaces with type and hash prefix", () => {
      const result = redact("Contact john@example.com", [
        { ...email, start: 8, end: 24 },
      ], "hash");
      expect(result.redacted_text).toMatch(/Contact \[EMAIL_[a-f0-9]{12}\]/);
    });

    it("produces consistent hashes for same input", () => {
      const r1 = redact("Contact john@example.com", [
        { ...email, start: 8, end: 24 },
      ], "hash");
      const r2 = redact("Contact john@example.com", [
        { ...email, start: 8, end: 24 },
      ], "hash");
      expect(r1.redacted_text).toBe(r2.redacted_text);
    });
  });

  describe("empty input", () => {
    it("returns original text when no entities", () => {
      const result = redact("Hello world", [], "token");
      expect(result.redacted_text).toBe("Hello world");
      expect(result.entities).toHaveLength(0);
    });
  });

  describe("entity ordering", () => {
    it("handles entities in any order without offset corruption", () => {
      const result = redact(baseText, [phone, email], "token");
      expect(result.redacted_text).not.toContain("john@example.com");
      expect(result.redacted_text).not.toContain("555-123-4567");
    });
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/redactor.test.ts
```

Expected: FAIL — `Cannot find module '../src/redactor.js'`

**Step 3: Write the redactor**

Create `src/redactor.ts`:

```typescript
import { createHash } from "node:crypto";
import type { Entity, RedactResult, RedactStrategy } from "./types.js";

export function redact(
  text: string,
  entities: Entity[],
  strategy: RedactStrategy = "token",
): RedactResult {
  if (entities.length === 0) {
    return { redacted_text: text, mapping: {}, entities: [] };
  }

  // Sort by start position descending so we can replace from end to start
  // without corrupting earlier offsets
  const sorted = [...entities].sort((a, b) => b.start - a.start);

  const counters: Record<string, number> = {};
  const mapping: Record<string, string> = {};
  let result = text;

  for (const entity of sorted) {
    const replacement = makeReplacement(entity, strategy, counters);
    mapping[replacement] = entity.text;
    result = result.slice(0, entity.start) + replacement + result.slice(entity.end);
  }

  return { redacted_text: result, mapping, entities };
}

function makeReplacement(
  entity: Entity,
  strategy: RedactStrategy,
  counters: Record<string, number>,
): string {
  switch (strategy) {
    case "token": {
      counters[entity.label] = (counters[entity.label] ?? 0) + 1;
      return `[${entity.label}_${counters[entity.label]}]`;
    }
    case "mask": {
      return "*".repeat(Math.max(entity.text.length, 1));
    }
    case "hash": {
      const digest = createHash("sha256")
        .update(entity.text)
        .digest("hex")
        .slice(0, 12);
      return `[${entity.label}_${digest}]`;
    }
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/redactor.test.ts
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/redactor.ts tests/redactor.test.ts
git commit -m "feat: add redactor with token, mask, and hash strategies"
```

---

### Task 4: Config Loader

**Files:**
- Create: `src/config.ts`
- Create: `tests/config.test.ts`

**Step 1: Write the failing tests**

Create `tests/config.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { loadConfig, DEFAULT_CONFIG } from "../src/config.js";

describe("loadConfig", () => {
  it("returns defaults when no overrides", () => {
    const config = loadConfig({});
    expect(config.enabled).toBe(true);
    expect(config.guardrail_mode).toBe("redact");
    expect(config.redactStrategy).toBe("token");
    expect(config.model).toBe("onnx-community/gliner_large-v2.1");
    expect(config.confidence_threshold).toBe(0.5);
    expect(config.custom_entities).toEqual([]);
    expect(config.entityActions).toEqual({});
  });

  it("merges partial overrides with defaults", () => {
    const config = loadConfig({
      guardrail_mode: "block",
      custom_entities: ["competitor name"],
    });
    expect(config.guardrail_mode).toBe("block");
    expect(config.custom_entities).toEqual(["competitor name"]);
    expect(config.enabled).toBe(true); // default preserved
  });

  it("validates guardrail_mode", () => {
    expect(() => loadConfig({ guardrail_mode: "invalid" as any })).toThrow();
  });

  it("validates confidence_threshold range", () => {
    expect(() => loadConfig({ confidence_threshold: -0.1 })).toThrow();
    expect(() => loadConfig({ confidence_threshold: 1.5 })).toThrow();
  });

  it("validates entityActions values", () => {
    expect(() =>
      loadConfig({ entityActions: { EMAIL: "invalid" as any } }),
    ).toThrow();
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/config.test.ts
```

Expected: FAIL — `Cannot find module '../src/config.js'`

**Step 3: Write the config loader**

Create `src/config.ts`:

```typescript
import type { FogClawConfig, GuardrailAction, RedactStrategy } from "./types.js";

const VALID_GUARDRAIL_MODES: GuardrailAction[] = ["redact", "block", "warn"];
const VALID_REDACT_STRATEGIES: RedactStrategy[] = ["token", "mask", "hash"];

export const DEFAULT_CONFIG: FogClawConfig = {
  enabled: true,
  guardrail_mode: "redact",
  redactStrategy: "token",
  model: "onnx-community/gliner_large-v2.1",
  confidence_threshold: 0.5,
  custom_entities: [],
  entityActions: {},
};

export function loadConfig(overrides: Partial<FogClawConfig>): FogClawConfig {
  const config: FogClawConfig = { ...DEFAULT_CONFIG, ...overrides };

  if (!VALID_GUARDRAIL_MODES.includes(config.guardrail_mode)) {
    throw new Error(
      `Invalid guardrail_mode "${config.guardrail_mode}". Must be one of: ${VALID_GUARDRAIL_MODES.join(", ")}`,
    );
  }

  if (!VALID_REDACT_STRATEGIES.includes(config.redactStrategy)) {
    throw new Error(
      `Invalid redactStrategy "${config.redactStrategy}". Must be one of: ${VALID_REDACT_STRATEGIES.join(", ")}`,
    );
  }

  if (config.confidence_threshold < 0 || config.confidence_threshold > 1) {
    throw new Error(
      `confidence_threshold must be between 0 and 1, got ${config.confidence_threshold}`,
    );
  }

  for (const [entityType, action] of Object.entries(config.entityActions)) {
    if (!VALID_GUARDRAIL_MODES.includes(action)) {
      throw new Error(
        `Invalid action "${action}" for entity type "${entityType}". Must be one of: ${VALID_GUARDRAIL_MODES.join(", ")}`,
      );
    }
  }

  return config;
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/config.test.ts
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: add config loader with validation and defaults"
```

---

### Task 5: GLiNER Engine Wrapper

**Files:**
- Create: `src/engines/gliner.ts`
- Create: `tests/gliner.test.ts`

**Step 1: Write the failing tests**

Create `tests/gliner.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GlinerEngine } from "../src/engines/gliner.js";

// Mock the gliner npm package since we don't want to download
// a 1.4GB model in tests
vi.mock("gliner", () => {
  return {
    Gliner: class MockGliner {
      async initialize() {}
      async inference(
        text: string,
        labels: string[],
        _opts: { threshold: number },
      ) {
        // Simulate GLiNER output based on the input text
        const results: Array<{
          text: string;
          label: string;
          score: number;
          start: number;
          end: number;
        }> = [];

        if (text.includes("John Smith")) {
          const idx = text.indexOf("John Smith");
          results.push({
            text: "John Smith",
            label: "person",
            score: 0.95,
            start: idx,
            end: idx + 10,
          });
        }

        if (text.includes("Acme Corp")) {
          const idx = text.indexOf("Acme Corp");
          results.push({
            text: "Acme Corp",
            label: "organization",
            score: 0.88,
            start: idx,
            end: idx + 9,
          });
        }

        // Only return entities whose labels were requested
        return results.filter((r) => labels.includes(r.label));
      }
    },
  };
});

describe("GlinerEngine", () => {
  let engine: GlinerEngine;

  beforeEach(async () => {
    engine = new GlinerEngine("mock-model", 0.5);
    await engine.initialize();
  });

  it("detects person entities", async () => {
    const entities = await engine.scan("John Smith works here");
    const persons = entities.filter((e) => e.label === "PERSON");
    expect(persons).toHaveLength(1);
    expect(persons[0].text).toBe("John Smith");
    expect(persons[0].source).toBe("gliner");
    expect(persons[0].confidence).toBe(0.95);
  });

  it("detects organization entities", async () => {
    const entities = await engine.scan("Works at Acme Corp");
    const orgs = entities.filter((e) => e.label === "ORGANIZATION");
    expect(orgs).toHaveLength(1);
    expect(orgs[0].text).toBe("Acme Corp");
  });

  it("detects multiple entity types", async () => {
    const entities = await engine.scan(
      "John Smith works at Acme Corp",
    );
    expect(entities.length).toBeGreaterThanOrEqual(2);
  });

  it("returns empty array for text with no entities", async () => {
    const entities = await engine.scan("The weather is nice today");
    expect(entities).toHaveLength(0);
  });

  it("includes custom labels in detection", async () => {
    engine.setCustomLabels(["competitor name"]);
    const entities = await engine.scan("John Smith works here");
    // Custom labels are passed to GLiNER but mock doesn't generate them
    // Just verify no crash
    expect(entities).toBeDefined();
  });

  it("applies canonical type mapping", async () => {
    const entities = await engine.scan("John Smith works here");
    const person = entities.find((e) => e.text === "John Smith");
    // "person" from GLiNER → "PERSON" canonical
    expect(person?.label).toBe("PERSON");
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/gliner.test.ts
```

Expected: FAIL — `Cannot find module '../src/engines/gliner.js'`

**Step 3: Write the GLiNER engine wrapper**

Create `src/engines/gliner.ts`:

```typescript
import type { Entity } from "../types.js";
import { canonicalType } from "../types.js";

const DEFAULT_NER_LABELS = [
  "person",
  "organization",
  "location",
  "address",
  "date of birth",
  "medical record number",
  "account number",
  "passport number",
];

export class GlinerEngine {
  private model: any = null;
  private modelPath: string;
  private threshold: number;
  private customLabels: string[] = [];
  private initialized = false;

  constructor(modelPath: string, threshold: number = 0.5) {
    this.modelPath = modelPath;
    this.threshold = threshold;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const { Gliner } = await import("gliner");
      this.model = new Gliner({
        tokenizerPath: this.modelPath,
        onnxSettings: {
          modelPath: this.modelPath,
          executionProvider: "cpu",
        },
        maxWidth: 12,
        modelType: "gliner",
      });
      await this.model.initialize();
      this.initialized = true;
    } catch (err) {
      throw new Error(
        `Failed to initialize GLiNER model "${this.modelPath}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  setCustomLabels(labels: string[]): void {
    this.customLabels = labels;
  }

  async scan(text: string, extraLabels?: string[]): Promise<Entity[]> {
    if (!text) return [];
    if (!this.model) {
      throw new Error("GLiNER engine not initialized. Call initialize() first.");
    }

    const labels = [
      ...DEFAULT_NER_LABELS,
      ...this.customLabels,
      ...(extraLabels ?? []),
    ];

    // Deduplicate labels
    const uniqueLabels = [...new Set(labels)];

    const results = await this.model.inference(text, uniqueLabels, {
      threshold: this.threshold,
    });

    return results.map(
      (r: { text: string; label: string; score: number; start: number; end: number }) => ({
        text: r.text,
        label: canonicalType(r.label),
        start: r.start,
        end: r.end,
        confidence: r.score,
        source: "gliner" as const,
      }),
    );
  }

  get isInitialized(): boolean {
    return this.initialized;
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/gliner.test.ts
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/engines/gliner.ts tests/gliner.test.ts
git commit -m "feat: add GLiNER ONNX engine wrapper with zero-shot NER"
```

---

### Task 6: Scanner (Pipeline Orchestrator)

**Files:**
- Create: `src/scanner.ts`
- Create: `tests/scanner.test.ts`

**Step 1: Write the failing tests**

Create `tests/scanner.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Scanner } from "../src/scanner.js";
import type { FogClawConfig, Entity } from "../src/types.js";
import { DEFAULT_CONFIG } from "../src/config.js";

// Mock GLiNER to avoid model downloads
vi.mock("gliner", () => {
  return {
    Gliner: class MockGliner {
      async initialize() {}
      async inference(
        text: string,
        labels: string[],
        _opts: { threshold: number },
      ) {
        const results: any[] = [];
        if (text.includes("John Smith")) {
          const idx = text.indexOf("John Smith");
          results.push({
            text: "John Smith",
            label: "person",
            score: 0.95,
            start: idx,
            end: idx + 10,
          });
        }
        return results.filter((r) => labels.includes(r.label));
      }
    },
  };
});

describe("Scanner", () => {
  let scanner: Scanner;

  beforeEach(async () => {
    scanner = new Scanner(DEFAULT_CONFIG);
    await scanner.initialize();
  });

  it("detects regex entities (email)", async () => {
    const result = await scanner.scan("Contact john@example.com");
    const emails = result.entities.filter((e) => e.label === "EMAIL");
    expect(emails).toHaveLength(1);
  });

  it("detects GLiNER entities (person)", async () => {
    const result = await scanner.scan("John Smith is here");
    const persons = result.entities.filter((e) => e.label === "PERSON");
    expect(persons).toHaveLength(1);
  });

  it("merges results from both engines", async () => {
    const result = await scanner.scan(
      "John Smith's email is john@example.com",
    );
    const labels = new Set(result.entities.map((e) => e.label));
    expect(labels.has("EMAIL")).toBe(true);
    expect(labels.has("PERSON")).toBe(true);
  });

  it("deduplicates overlapping spans preferring higher confidence", async () => {
    const result = await scanner.scan(
      "John Smith's email is john@example.com",
    );
    // Check no duplicate spans at same position
    const seen = new Set<string>();
    for (const e of result.entities) {
      const key = `${e.start}-${e.end}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("returns original text in result", async () => {
    const text = "Hello world";
    const result = await scanner.scan(text);
    expect(result.text).toBe(text);
  });

  it("works with extra labels passed at scan time", async () => {
    const result = await scanner.scan("John Smith is here", [
      "competitor name",
    ]);
    expect(result).toBeDefined();
  });

  it("works in regex-only mode when GLiNER fails to init", async () => {
    const failScanner = new Scanner({
      ...DEFAULT_CONFIG,
      model: "nonexistent/model",
    });
    // Don't initialize GLiNER — should fall back to regex-only
    const result = await failScanner.scan("Contact john@example.com");
    const emails = result.entities.filter((e) => e.label === "EMAIL");
    expect(emails).toHaveLength(1);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/scanner.test.ts
```

Expected: FAIL — `Cannot find module '../src/scanner.js'`

**Step 3: Write the scanner**

Create `src/scanner.ts`:

```typescript
import type { Entity, FogClawConfig, ScanResult } from "./types.js";
import { RegexEngine } from "./engines/regex.js";
import { GlinerEngine } from "./engines/gliner.js";

export class Scanner {
  private regexEngine: RegexEngine;
  private glinerEngine: GlinerEngine;
  private glinerAvailable = false;
  private config: FogClawConfig;

  constructor(config: FogClawConfig) {
    this.config = config;
    this.regexEngine = new RegexEngine();
    this.glinerEngine = new GlinerEngine(
      config.model,
      config.confidence_threshold,
    );
    if (config.custom_entities.length > 0) {
      this.glinerEngine.setCustomLabels(config.custom_entities);
    }
  }

  async initialize(): Promise<void> {
    try {
      await this.glinerEngine.initialize();
      this.glinerAvailable = true;
    } catch (err) {
      console.warn(
        `[fogclaw] GLiNER failed to initialize, falling back to regex-only mode: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.glinerAvailable = false;
    }
  }

  async scan(text: string, extraLabels?: string[]): Promise<ScanResult> {
    if (!text) return { entities: [], text };

    // Step 1: Regex pass (always runs, synchronous)
    const regexEntities = this.regexEngine.scan(text);

    // Step 2: GLiNER pass (if available)
    let glinerEntities: Entity[] = [];
    if (this.glinerAvailable) {
      try {
        glinerEntities = await this.glinerEngine.scan(text, extraLabels);
      } catch (err) {
        console.warn(`[fogclaw] GLiNER scan failed, using regex results only: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Step 3: Merge and deduplicate
    const merged = deduplicateEntities([...regexEntities, ...glinerEntities]);

    return { entities: merged, text };
  }
}

/**
 * Remove overlapping entity spans. When two entities overlap,
 * keep the one with higher confidence. If equal, prefer regex.
 */
function deduplicateEntities(entities: Entity[]): Entity[] {
  if (entities.length <= 1) return entities;

  // Sort by start position, then by confidence descending
  const sorted = [...entities].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.confidence - a.confidence;
  });

  const result: Entity[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = result[result.length - 1];

    // Check for overlap
    if (current.start < last.end) {
      // Overlapping: keep higher confidence (already in result if first)
      if (current.confidence > last.confidence) {
        result[result.length - 1] = current;
      }
      // Otherwise keep what's already in result
    } else {
      result.push(current);
    }
  }

  return result;
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/scanner.test.ts
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/scanner.ts tests/scanner.test.ts
git commit -m "feat: add scanner pipeline orchestrating regex → GLiNER with dedup"
```

---

### Task 7: OpenClaw Plugin Entry Point

**Files:**
- Create: `src/index.ts`

**Step 1: Write the plugin entry point**

Create `src/index.ts`:

```typescript
import { Scanner } from "./scanner.js";
import { redact } from "./redactor.js";
import { loadConfig } from "./config.js";
import type { FogClawConfig, GuardrailAction } from "./types.js";

export { Scanner } from "./scanner.js";
export { redact } from "./redactor.js";
export { loadConfig, DEFAULT_CONFIG } from "./config.js";
export type {
  Entity,
  FogClawConfig,
  ScanResult,
  RedactResult,
  RedactStrategy,
  GuardrailAction,
} from "./types.js";

/**
 * OpenClaw plugin registration.
 *
 * Registers:
 * - `before_agent_start` hook for automatic PII guardrail
 * - `fogclaw_scan` tool for on-demand entity detection
 * - `fogclaw_redact` tool for on-demand redaction
 */
export async function register(api: any) {
  const rawConfig = api.getConfig?.() ?? {};
  const config = loadConfig(rawConfig);

  if (!config.enabled) {
    console.log("[fogclaw] Plugin disabled via config");
    return;
  }

  const scanner = new Scanner(config);
  await scanner.initialize();

  // --- HOOK: Guardrail on incoming messages ---
  api.registerHook("before_agent_start", async (context: any) => {
    const result = await scanner.scan(context.message);

    if (result.entities.length === 0) return;

    // Check for any "block" actions
    for (const entity of result.entities) {
      const action: GuardrailAction =
        config.entityActions[entity.label] ?? config.guardrail_mode;

      if (action === "block") {
        return api.reply(
          `Message blocked: detected ${entity.label}. Please rephrase without sensitive information.`,
        );
      }
    }

    // Check for any "warn" actions
    const warnings = result.entities.filter((e) => {
      const action = config.entityActions[e.label] ?? config.guardrail_mode;
      return action === "warn";
    });
    if (warnings.length > 0) {
      const types = [...new Set(warnings.map((w) => w.label))].join(", ");
      api.notify?.(`PII detected: ${types}`);
    }

    // Apply redaction for "redact" action entities
    const toRedact = result.entities.filter((e) => {
      const action = config.entityActions[e.label] ?? config.guardrail_mode;
      return action === "redact";
    });
    if (toRedact.length > 0) {
      const redacted = redact(context.message, toRedact, config.redactStrategy);
      context.message = redacted.redacted_text;
    }
  });

  // --- TOOL: On-demand scan ---
  api.registerTool({
    id: "fogclaw_scan",
    name: "Scan for PII",
    description:
      "Scan text for PII and custom entities. Returns detected entities with types, positions, and confidence scores.",
    parameters: {
      text: {
        type: "string",
        description: "Text to scan for entities",
        required: true,
      },
      custom_labels: {
        type: "array",
        description:
          "Additional entity labels for zero-shot detection (e.g., ['competitor name', 'project codename'])",
        required: false,
      },
    },
    handler: async ({
      text,
      custom_labels,
    }: {
      text: string;
      custom_labels?: string[];
    }) => {
      const result = await scanner.scan(text, custom_labels);
      return {
        entities: result.entities,
        count: result.entities.length,
        summary: result.entities.length > 0
          ? `Found ${result.entities.length} entities: ${[...new Set(result.entities.map((e) => e.label))].join(", ")}`
          : "No entities detected",
      };
    },
  });

  // --- TOOL: On-demand redact ---
  api.registerTool({
    id: "fogclaw_redact",
    name: "Redact PII",
    description:
      "Scan and redact PII/custom entities from text. Returns sanitized text with entities replaced.",
    parameters: {
      text: {
        type: "string",
        description: "Text to scan and redact",
        required: true,
      },
      strategy: {
        type: "string",
        description:
          'Redaction strategy: "token" ([EMAIL_1]), "mask" (****), or "hash" ([EMAIL_a1b2c3...])',
        enum: ["token", "mask", "hash"],
        required: false,
      },
      custom_labels: {
        type: "array",
        description: "Additional entity labels for zero-shot detection",
        required: false,
      },
    },
    handler: async ({
      text,
      strategy,
      custom_labels,
    }: {
      text: string;
      strategy?: "token" | "mask" | "hash";
      custom_labels?: string[];
    }) => {
      const result = await scanner.scan(text, custom_labels);
      const redacted = redact(
        text,
        result.entities,
        strategy ?? config.redactStrategy,
      );
      return {
        redacted_text: redacted.redacted_text,
        entities_found: result.entities.length,
        mapping: redacted.mapping,
      };
    },
  });

  console.log(
    `[fogclaw] Plugin registered — guardrail: ${config.guardrail_mode}, model: ${config.model}, custom entities: ${config.custom_entities.length}`,
  );
}
```

**Step 2: Verify the project builds**

```bash
npx tsc
```

Expected: Clean compile, no errors.

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add OpenClaw plugin entry point with hook and tool registration"
```

---

### Task 8: Run Full Test Suite & Final Verification

**Step 1: Run all tests**

```bash
npx vitest run
```

Expected: All tests in `regex.test.ts`, `redactor.test.ts`, `config.test.ts`, `gliner.test.ts`, and `scanner.test.ts` pass.

**Step 2: Verify clean build**

```bash
npx tsc
```

Expected: No errors.

**Step 3: Verify package structure**

```bash
ls dist/
```

Expected: `index.js`, `index.d.ts`, `types.js`, `types.d.ts`, `config.js`, `config.d.ts`, `scanner.js`, `scanner.d.ts`, `redactor.js`, `redactor.d.ts`, `engines/regex.js`, `engines/regex.d.ts`, `engines/gliner.js`, `engines/gliner.d.ts` (plus `.map` files).

**Step 4: Commit any remaining changes**

```bash
git add -A
git commit -m "chore: verify full build and test suite"
```

---

### Task 9: Push to GitHub

**Step 1: Create the repo on GitHub**

```bash
gh repo create datafog/fogclaw --public --description "OpenClaw plugin for PII detection & custom entity redaction powered by DataFog" --license MIT
```

**Step 2: Add remote and push**

```bash
git remote add origin https://github.com/datafog/fogclaw.git
git branch -M main
git push -u origin main
```

**Step 3: Verify on GitHub**

```bash
gh repo view datafog/fogclaw --web
```

---

## Summary

| Task | What | Key files |
|------|------|-----------|
| 1 | Repo scaffold | `package.json`, `tsconfig.json`, `openclaw.plugin.json`, `src/types.ts` |
| 2 | Regex engine | `src/engines/regex.ts`, `tests/regex.test.ts` |
| 3 | Redactor | `src/redactor.ts`, `tests/redactor.test.ts` |
| 4 | Config loader | `src/config.ts`, `tests/config.test.ts` |
| 5 | GLiNER wrapper | `src/engines/gliner.ts`, `tests/gliner.test.ts` |
| 6 | Scanner pipeline | `src/scanner.ts`, `tests/scanner.test.ts` |
| 7 | Plugin entry | `src/index.ts` |
| 8 | Full verification | Run all tests + build |
| 9 | Push to GitHub | Create repo + push |
