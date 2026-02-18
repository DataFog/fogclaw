import { execSync, spawn, type ChildProcess } from "node:child_process";
import {
  mkdirSync,
  copyFileSync,
  existsSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

const PROJECT_ROOT = resolve(import.meta.dirname, "../..");
const PROFILE_NAME = "e2e-test";
const PROFILE_DIR = join(process.env.HOME!, `.openclaw-${PROFILE_NAME}`);
const MAIN_AUTH = join(
  process.env.HOME!,
  ".openclaw/agents/main/agent/auth-profiles.json",
);
const PROFILE_AUTH_DIR = join(PROFILE_DIR, "agents/main/agent");
const GATEWAY_PORT = 19001;
const GATEWAY_TOKEN = "e2e-test-token";
const PID_FILE = join(PROJECT_ROOT, "tests/e2e/.gateway-pid");

function oc(args: string): string {
  return execSync(`openclaw --profile ${PROFILE_NAME} ${args}`, {
    encoding: "utf-8",
    timeout: 30_000,
    env: { ...process.env, NO_COLOR: "1" },
  }).trim();
}

export default async function globalSetup() {
  console.log("\n=== FogClaw E2E: Setting up isolated OpenClaw profile ===\n");

  // 1. Build FogClaw from source (ensure dist/ is current)
  console.log("Building FogClaw from source...");
  execSync("npm run build", {
    cwd: PROJECT_ROOT,
    encoding: "utf-8",
    timeout: 60_000,
    stdio: "inherit",
  });

  // 2. Kill any leftover gateway on the test port
  try {
    const pid = execSync(`lsof -ti :${GATEWAY_PORT}`, { encoding: "utf-8" }).trim();
    if (pid) {
      console.log(`Killing leftover process on port ${GATEWAY_PORT} (PID ${pid})`);
      execSync(`kill ${pid}`, { encoding: "utf-8" });
      await sleep(1000);
    }
  } catch {
    // No process on port — good
  }

  // 3. Clean up any previous profile
  if (existsSync(PROFILE_DIR)) {
    console.log(`Cleaning up previous profile at ${PROFILE_DIR}`);
    execSync(`rm -rf "${PROFILE_DIR}"`, { encoding: "utf-8" });
  }

  // 4. Initialize the isolated profile with gateway config
  console.log(`Creating isolated profile: ${PROFILE_NAME}`);
  oc("config set gateway.mode local");
  oc(`config set gateway.port ${GATEWAY_PORT}`);
  oc("config set gateway.auth.mode token");
  oc(`config set gateway.auth.token ${GATEWAY_TOKEN}`);

  // 5. Configure plugin loading from local build
  oc(`config set 'plugins.load.paths' '["${PROJECT_ROOT}"]'`);

  // 6. Copy auth credentials from main profile
  if (!existsSync(MAIN_AUTH)) {
    throw new Error(
      `Main profile auth not found at ${MAIN_AUTH}. Run 'openclaw' once to set up credentials.`,
    );
  }
  mkdirSync(PROFILE_AUTH_DIR, { recursive: true });
  copyFileSync(MAIN_AUTH, join(PROFILE_AUTH_DIR, "auth-profiles.json"));
  console.log("Copied auth credentials to isolated profile");

  // 7. Start gateway in background
  console.log(`Starting gateway on port ${GATEWAY_PORT}...`);
  const gateway = spawn(
    "openclaw",
    ["--profile", PROFILE_NAME, "gateway", "run", "--port", String(GATEWAY_PORT), "--force"],
    {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NO_COLOR: "1" },
    },
  );

  // Save PID for teardown
  writeFileSync(PID_FILE, String(gateway.pid));
  gateway.unref();

  // 8. Wait for gateway to be ready
  console.log("Waiting for gateway to be ready...");
  const ready = await waitForGateway(GATEWAY_PORT, 30_000);
  if (!ready) {
    // Dump any stderr output for debugging
    throw new Error(`Gateway failed to start on port ${GATEWAY_PORT} within 30s`);
  }
  console.log("Gateway is ready!");

  // 9. Verify FogClaw is loaded
  const info = oc("plugins info fogclaw");
  console.log("Plugin info:", info);

  if (!info.includes("fogclaw_scan")) {
    console.warn("WARNING: FogClaw tools may not be fully registered. Agent responses may have issues.");
  }

  console.log("\n=== FogClaw E2E: Setup complete ===\n");
}

async function waitForGateway(port: number, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/`);
      if (resp.ok || resp.status === 401 || resp.status === 404) {
        return true;
      }
    } catch {
      // Not ready yet
    }
    await sleep(500);
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
