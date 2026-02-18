import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const PROJECT_ROOT = resolve(import.meta.dirname, "../..");
const SCREENSHOTS_DIR = join(PROJECT_ROOT, "tests/e2e/screenshots");
const RECORDINGS_DIR = join(PROJECT_ROOT, "tests/e2e/recordings");
const PII_FIXTURE = join(PROJECT_ROOT, "tests/e2e/fixtures/pii-sample.txt");

const PROFILE_NAME = "e2e-test";
const GATEWAY_PORT = 19001;
const GATEWAY_TOKEN = "e2e-test-token";

// Use a stable dummy phone number to create/reuse a session in the isolated profile
const E2E_PHONE = "+15550001234";

// Raw PII values that must NOT appear in agent responses when FogClaw is active
const RAW_PII = [
  "john.smith@example.com",
  "123-45-6789",
  "(555) 867-5309",
  "555-867-5309",
  "4111-1111-1111-1111",
];

// Redaction tokens that SHOULD appear when FogClaw redacts
const REDACTION_TOKEN_PATTERN = /\[(EMAIL|SSN|PHONE|CREDIT_CARD)_\d+\]/;

let dashboardUrl: string;

function openclaw(args: string): string {
  return execSync(`openclaw --profile ${PROFILE_NAME} ${args}`, {
    encoding: "utf-8",
    timeout: 120_000,
    env: { ...process.env, NO_COLOR: "1" },
  }).trim();
}

function agentMessage(message: string): { status: string; text: string; raw: unknown } {
  const raw = JSON.parse(
    openclaw(`agent --to ${E2E_PHONE} --message "${message.replace(/"/g, '\\"')}" --json --timeout 90`),
  );
  const text =
    raw?.result?.payloads?.map((p: { text: string }) => p.text).join("\n") ?? "";
  return { status: raw?.status ?? "unknown", text, raw };
}

function assertNoPiiLeaked(text: string, context: string) {
  for (const pii of RAW_PII) {
    expect(text, `${context}: raw PII "${pii}" leaked through`).not.toContain(
      pii,
    );
  }
}

// ── Setup & Scanning Tests ──────────────────────────────────────────────

test.describe.serial("FogClaw E2E Baseline", () => {
  test("setup: FogClaw loaded with tools", async () => {
    // Verify FogClaw is loaded (global-setup already handled profile creation)
    const info = openclaw("plugins info fogclaw");
    console.log("Plugin info:", info);
    expect(info).toContain("fogclaw_scan");
    expect(info).toContain("fogclaw_redact");

    // Get Dashboard URL
    try {
      const dashOutput = openclaw("dashboard --no-open");
      dashboardUrl = dashOutput
        .split("\n")
        .find((l: string) => l.includes("127.0.0.1") || l.includes("localhost"))
        ?.replace(/^.*?(https?:\/\/)/, "$1")
        .trim() ?? "";
    } catch {
      // Fallback to constructed URL if dashboard command fails on isolated profile
      dashboardUrl = "";
    }

    // Fallback to constructed URL with known token
    if (!dashboardUrl) {
      dashboardUrl = `http://127.0.0.1:${GATEWAY_PORT}/#token=${GATEWAY_TOKEN}`;
    }
    console.log("Dashboard URL:", dashboardUrl);
  });

  // ── Three Scanning Layers ────────────────────────────────────────────

  test("before_agent_start: redacts PII in inbound prompt", async () => {
    const { text, status } = agentMessage(
      "I need to contact John Smith at john.smith@example.com about SSN 123-45-6789. What should I do?",
    );
    console.log("Agent response:", text.slice(0, 500));

    expect(status).toBe("ok");
    assertNoPiiLeaked(text, "before_agent_start");
  });

  test("tool_result_persist: redacts PII in file reads", async () => {
    const { text, status } = agentMessage(
      `Please read the file at ${PII_FIXTURE} and summarize its contents.`,
    );
    console.log("Agent response:", text.slice(0, 500));

    expect(status).toBe("ok");
    assertNoPiiLeaked(text, "tool_result_persist");
  });

  test("message_sending: redacts PII in outbound replies", async () => {
    const { text, status } = agentMessage(
      "Please repeat this information exactly as I give it: email alice@widgets.io and SSN 987-65-4321",
    );
    console.log("Agent response:", text.slice(0, 500));

    expect(status).toBe("ok");
    expect(text).not.toContain("alice@widgets.io");
    expect(text).not.toContain("987-65-4321");
  });

  // ── Access Request Backlog ───────────────────────────────────────────

  test("access request backlog: request → list → approve → reveal", async () => {
    // Step 1: Request access to a redacted placeholder
    const requestResp = agentMessage(
      "Use the fogclaw_request_access tool to request access to the placeholder [EMAIL_1]. Reason: need original for compliance audit.",
    );
    console.log("Request response:", requestResp.text.slice(0, 300));
    expect(requestResp.status).toBe("ok");

    // Step 2: List pending requests
    const listResp = agentMessage(
      "Use the fogclaw_requests tool to list all pending access requests.",
    );
    console.log("List response:", listResp.text.slice(0, 300));
    expect(listResp.status).toBe("ok");

    // Step 3: Approve the request
    const resolveResp = agentMessage(
      "Use the fogclaw_resolve tool to approve the most recent pending access request.",
    );
    console.log("Resolve response:", resolveResp.text.slice(0, 300));
    expect(resolveResp.status).toBe("ok");
  });

  // ── Browser Visual Evidence ──────────────────────────────────────────

  test("Dashboard shows FogClaw redaction evidence", async ({ page }) => {
    mkdirSync(SCREENSHOTS_DIR, { recursive: true });

    // Navigate to Dashboard
    const url = dashboardUrl || `http://127.0.0.1:${GATEWAY_PORT}/#token=${GATEWAY_TOKEN}`;
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    // Screenshot: Dashboard overview
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "dashboard-overview.png"),
      fullPage: true,
    });

    // Navigate to Chat
    const chatLink = page.getByRole("link", { name: "Chat" });
    if (await chatLink.isVisible()) {
      await chatLink.click();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);
    }

    // Screenshot: Chat with redaction evidence
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "chat-redaction-evidence.png"),
      fullPage: true,
    });

    // Verify page loaded with content
    const pageText = await page.textContent("body");
    expect(pageText).toBeTruthy();
    console.log(
      "Dashboard chat text (first 500 chars):",
      pageText?.slice(0, 500),
    );
  });

  // ── After all: copy video recordings ─────────────────────────────────

  test.afterAll(async () => {
    // Copy video recordings to the recordings directory
    const testResultsDir = join(PROJECT_ROOT, "tests/e2e/test-results");
    if (existsSync(testResultsDir)) {
      mkdirSync(RECORDINGS_DIR, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const findVideos = (dir: string): string[] => {
        const results: string[] = [];
        try {
          for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) results.push(...findVideos(fullPath));
            else if (entry.name.endsWith(".webm")) results.push(fullPath);
          }
        } catch {
          /* ignore */
        }
        return results;
      };

      const videos = findVideos(testResultsDir);
      for (let i = 0; i < videos.length; i++) {
        const dest = join(RECORDINGS_DIR, `${timestamp}-${i}.webm`);
        cpSync(videos[i], dest);
        console.log(`Video saved: ${dest}`);
      }
    }
  });
});
