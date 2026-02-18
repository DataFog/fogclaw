---
slug: 2026-02-17-feat-e2e-recorded-baseline-test
status: spike-complete
date: 2026-02-17T20:00:00Z
owner: sidmohan
timebox: 2h
---

# Spike: OpenClaw Dashboard Automation & E2E Test Feasibility

## Context

FogClaw spec `2026-02-17-feat-e2e-recorded-baseline-test-spec.md` requires a fully automated E2E test against a real OpenClaw instance. Before planning, we need to validate that (1) the OpenClaw Dashboard UI can be driven programmatically, (2) CLI agent commands can send prompts and receive structured responses, (3) plugin update/install is automatable, and (4) video recording of the full sequence is feasible.

The spec's open questions `[spike]` specifically ask:
- How does OpenClaw's local development setup work? (R1, R7, R8)
- Can agent-browser drive the OpenClaw Dashboard reliably? (R7)

## Validation Goal

Determine the exact commands, ports, selectors, and interaction patterns needed for E2E automation — or discover it's infeasible and recommend an alternative.

Spike is complete when we can describe the resulting understanding with enough confidence to proceed into `he-plan`.

## Approach

1. Explored the OpenClaw CLI help tree to map all available commands
2. Queried `openclaw status`, `openclaw plugins list/info`, `openclaw sessions --json` for system topology
3. Tested `openclaw agent --session-id <id> --message <text> --json` for programmatic agent interaction
4. Tested `openclaw plugins update fogclaw --dry-run` for plugin update mechanism
5. Installed Playwright Chromium via `npx playwright install chromium`
6. Used `agent-browser` to navigate the Dashboard, snapshot interactive elements, and take screenshots
7. Inventoried all Dashboard navigation, chat interface, and config page elements

## Findings

### 1. OpenClaw Local Setup (Confirmed Working)

| Component | Detail |
|---|---|
| CLI | `/opt/homebrew/bin/openclaw` v2026.2.15 |
| Gateway | Running as macOS LaunchAgent, pid 48042 |
| WebSocket | `ws://127.0.0.1:18789` |
| Dashboard | `http://127.0.0.1:18789/` |
| Auth | Token-based: `http://127.0.0.1:18789/#token=<hex>` |
| Token retrieval | `openclaw dashboard --no-open` prints URL with token |
| Active sessions | 1 (session key `agent:main:main`) |
| Model | claude-opus-4-6, 200k context |

**Evidence:** `openclaw status` returns Connected, 4h uptime. Dashboard accessible and screenshot captured.

### 2. CLI Agent Automation (Confirmed Working)

**Command pattern:**
```bash
openclaw agent --session-id "<uuid>" --message "<prompt>" --json --timeout 30
```

**Key behaviors:**
- Returns structured JSON with `status`, `result.payloads[].text`, and `result.meta`
- Requires `--session-id`, `--to`, or `--agent` flag (plain `--message` alone fails)
- Session ID available from `openclaw sessions --json`
- `--json` flag gives machine-parseable output
- Agent metadata includes provider, model, usage stats, and system prompt report
- Tool calls appear in the response (fogclaw_scan, fogclaw_redact visible)

**Evidence:** Successfully sent a test message and received JSON response with full agent metadata.

### 3. Plugin Management (Confirmed Working)

| Command | Purpose |
|---|---|
| `openclaw plugins list` | List all discovered plugins (37 total, 7 loaded) |
| `openclaw plugins info fogclaw` | Show plugin details, version, source, tools |
| `openclaw plugins update fogclaw` | Update from npm (tested dry-run: 0.1.6 → 0.3.0) |
| `openclaw plugins update fogclaw --dry-run` | Preview update without applying |
| `openclaw plugins disable fogclaw` | Disable plugin |
| `openclaw plugins enable fogclaw` | Re-enable plugin |
| `openclaw plugins install <spec>` | Install new plugin from npm/path/archive |

**Current state:** FogClaw v0.1.6 installed at `~/.openclaw/extensions/fogclaw/`. Only 3 tools registered (fogclaw_scan, fogclaw_preview, fogclaw_redact). The v0.3.0 tools (fogclaw_request_access, fogclaw_requests, fogclaw_resolve) are missing. Schema shows `propertiesCount: null` for FogClaw tools, indicating v0.1.6 has schema issues.

**Security warning:** Plugin update produces `WARNING: Plugin "fogclaw" contains dangerous code patterns: Environment variable access combined with network send`. This is the GLiNER model download code — expected, not malicious.

### 4. Dashboard UI Structure (Confirmed Automatable)

**Navigation sidebar:**
- **Chat**: Chat (main agent interaction)
- **Control**: Overview, Channels, Instances, Sessions, Usage, Cron Jobs
- **Agent**: Agents, Skills, Nodes
- **Settings**: Config, Debug, Logs, Docs

**Chat page elements (automatable):**
- Session selector (combobox with options like "Main Session")
- Message input textbox ("Message (↩ to send, Shift+↩ for line breaks, paste images)")
- "Send" button
- "New session" button
- Refresh, toggle thinking, toggle focus mode buttons
- Tool call results displayed inline (fogclaw_scan, fogclaw_redact visible with expandable "View")
- "Copy as markdown" buttons on tool outputs

**Config page elements (automatable):**
- Settings category sidebar: All Settings, Environment, Updates, Agents, Authentication, Channels, Messages, Commands, Hooks, Skills, Tools, Gateway, Setup Wizard, etc.
- Search settings input
- Form/Raw toggle (Form view for structured editing, Raw for JSON)
- Reload, Save, Apply, Update buttons
- Settings rendered as form fields with labels

**Selector strategy:**
- **No `data-testid` attributes** found in the Dashboard UI
- Text-based selectors work well: buttons have clear text labels ("Send", "New session", "Overview")
- Role-based selectors available via Playwright `getByRole()`
- Link text selectors for navigation: "Chat", "Config", "Overview"
- Input fields identifiable by placeholder text: "Search settings...", "Message (↩ to send...)"

### 5. Video Recording (Confirmed Feasible)

- Playwright Chromium v1208 (Chrome 145.0.7632.6) installed successfully
- FFmpeg v1011 installed for video encoding
- `agent-browser record start demo.webm` available for recording sessions
- Playwright's built-in `video: 'on'` config also available for test-level recording
- Both `.webm` native and `.mp4` transcode paths viable

### 6. Hooks System (Separate from Plugin Hooks)

The Dashboard Config > Hooks section shows OpenClaw's internal webhook/event hook configuration (agent IDs, session key prefixes, etc.). This is **separate from** FogClaw's plugin hooks (`before_agent_start`, `tool_result_persist`, `message_sending`). FogClaw's hooks are registered through the plugin system, not the hooks config. The Dashboard currently shows 4 bundled hooks (boot-md, bootstrap-extra-files, command-logger, session-memory).

## Decisions

- Decision: Use `openclaw agent --session-id <id> --message <text> --json` for CLI-driven agent interaction in E2E tests.
  Rationale: Returns structured JSON, supports session targeting, and includes tool call metadata. No browser needed for prompt/response validation.

- Decision: Use text and role-based Playwright selectors (not data-testid) for Dashboard automation.
  Rationale: Dashboard has no data-testid convention. Text labels are descriptive and stable (e.g., button "Send", link "Config"). If selectors break on OpenClaw updates, we update selectors — this is documented risk.

- Decision: Update FogClaw to v0.3.0 as a prerequisite step in E2E test setup.
  Rationale: v0.1.6 is missing 3 tools and has schema issues. `openclaw plugins update fogclaw` handles this cleanly.

- Decision: Use `agent-browser`/Playwright headless for CI, headed for local debugging.
  Rationale: Playwright supports both modes natively. Video recording works in both.

- Decision: Use hash-token auth pattern (`#token=<hex>`) for Dashboard access in E2E tests.
  Rationale: `openclaw dashboard --no-open` returns the full authenticated URL. No manual login flow needed.

## Recommendation

**Proceed to `he-plan`.** All validation goals are met:

1. OpenClaw is running locally and accessible programmatically
2. CLI agent automation works with structured JSON output
3. Dashboard UI is automatable with Playwright (text/role selectors)
4. Plugin update is a single command
5. Video recording infrastructure is in place

The E2E test architecture should be:
- **CLI-first**: Use `openclaw agent` for prompt sending and response validation (fast, reliable, JSON-parseable)
- **Browser for Dashboard verification**: Use Playwright for plugin visibility, config verification, and visual evidence
- **Hybrid recording**: Record the Playwright browser session for visual evidence; parse CLI JSON for programmatic assertions

### Suggested Test Flow

1. `openclaw plugins update fogclaw` — ensure v0.3.0
2. `openclaw sessions --json` — get session info
3. Playwright opens Dashboard → verify FogClaw in tools list
4. CLI sends PII prompt → parse JSON response → assert redaction tokens present
5. CLI sends file-read trigger → assert tool_result_persist redaction
6. CLI sends message → assert outbound message_sending redaction
7. CLI exercises backlog tools (request_access, requests, resolve)
8. Playwright captures final Dashboard state
9. Video saved to `tests/e2e/recordings/`

## Impact on Upstream Docs

Spec updates needed in `docs/specs/2026-02-17-feat-e2e-recorded-baseline-test-spec.md`:

- **Open Questions**: Close the `[spike]` questions (R1/R7/R8) — all answered
- **R1**: Confirm 6 tools after v0.3.0 update (was uncertain about registration)
- **R7**: Confirm agent-browser/Playwright can drive Dashboard (feasible with text selectors)
- **R8**: Refine selector strategy — text/role based, no data-testid
- **Constraints**: Add note about FogClaw v0.3.0 prerequisite
- **Risks**: Downgrade "OpenClaw Dashboard UI instability" risk — selectors are text-based and reasonably stable

## Spike Code

- worktree: n/a (spike was exploratory, no prototype code)
- branch: main
- prototypes: n/a
- variants: n/a
- reusable: no
- screenshots: `/tmp/openclaw-overview.png`, `/tmp/openclaw-config.png`, `/tmp/openclaw-chat.png`

## Remaining Unknowns

1. **`tool_result_persist` triggering from CLI**: How to make the agent read a file containing PII via CLI prompt. Likely: include a prompt like "Read the file at /path/to/pii-fixture.txt" and the agent uses the `read` tool.
2. **`message_sending` hook assertion from CLI**: The `--json` response may not distinguish between pre-hook and post-hook content. May need to check Dashboard chat or gateway logs for hook evidence.
3. **Gateway restart after plugin update**: Does `openclaw plugins update fogclaw` require a gateway restart for new tools to register? Likely yes — need to verify during implementation.
4. **Session isolation for E2E**: Should E2E tests create a new session (`New session` button or `--to` flag) to avoid polluting existing sessions? Almost certainly yes.

## Time Spent

- budget: 2h
- actual: ~45m

## Revision Notes

- 2026-02-17T20:00:00Z: Initialized spike. Explored OpenClaw CLI, Dashboard UI, and automation feasibility. All validation goals met — proceed to planning.
