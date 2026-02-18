import { execSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";

const PROJECT_ROOT = resolve(import.meta.dirname, "../..");
const PROFILE_NAME = "e2e-test";
const PROFILE_DIR = join(process.env.HOME!, `.openclaw-${PROFILE_NAME}`);
const GATEWAY_PORT = 19001;
const PID_FILE = join(PROJECT_ROOT, "tests/e2e/.gateway-pid");

export default async function globalTeardown() {
  console.log("\n=== FogClaw E2E: Tearing down ===\n");

  // 1. Kill gateway by PID file
  if (existsSync(PID_FILE)) {
    const pid = readFileSync(PID_FILE, "utf-8").trim();
    console.log(`Killing gateway process (PID ${pid})`);
    try {
      process.kill(Number(pid), "SIGTERM");
    } catch {
      // Process may already be gone
    }
    unlinkSync(PID_FILE);
  }

  // 2. Kill anything still on the gateway port
  try {
    const portPid = execSync(`lsof -ti :${GATEWAY_PORT}`, { encoding: "utf-8" }).trim();
    if (portPid) {
      console.log(`Killing remaining process on port ${GATEWAY_PORT} (PID ${portPid})`);
      execSync(`kill ${portPid}`, { encoding: "utf-8" });
    }
  } catch {
    // Nothing on port — good
  }

  // 3. Clean up isolated profile
  if (existsSync(PROFILE_DIR)) {
    console.log(`Removing isolated profile at ${PROFILE_DIR}`);
    execSync(`rm -rf "${PROFILE_DIR}"`, { encoding: "utf-8" });
  }

  console.log("\n=== FogClaw E2E: Teardown complete ===\n");
}
