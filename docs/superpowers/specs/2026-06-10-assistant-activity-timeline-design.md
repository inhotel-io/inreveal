# Assistant Activity Timeline — Design

**Date:** 2026-06-10
**Status:** Approved (brainstormed with Pierre; layout chosen visually)
**Scope:** Web (`web/src/routes/(user)/assistant/`) + a small server fix (`server/src/services/agent-runner.service.ts`). Agent-runner untouched.

## Problem

The current "Activity summary" block renders coarse lifecycle phases ("Understanding request", "Working with Gallery") that are too high-level to explain what the agent actually did, while the genuinely useful per-tool-call data (tool name, request/response summaries, counts, durations, errors — all already persisted in `agent_tool_call` and fetched by the web) is buried in a hidden "technical rows" layer.

Known bug: the `start-processing` activity event is created with status `running` and no completion event is ever written on a successful turn (`agent-runner.service.ts` only updates it on failure), so the first card shows "Running" forever — even after the turn finishes or the session is cancelled.

Primary audience (per brainstorm): **debugging / power-user**. The view should be off by default and deep when opened.

## Design

### Per-turn, three states (Layout A — inline)

Each assistant turn owns its own activity affordance, rendered inline in the conversation under the triggering user message:

1. **Running:** a single quiet italic one-liner showing the current step as a friendly verb ("Searching photos…", "Proposing album…"), derived from the most recent in-flight tool call; before the first tool call it reads "Understanding request…". Clicking it expands the live timeline.
2. **Settled, collapsed (default):** the one-liner is replaced by a subtle summary line: `4 steps · 2.3s` (duration = wall-clock from the first tool call's `startedAt` to the last one's `completedAt`), with `· 1 failed` appended in red when any step failed, or `· cancelled` when the turn was cancelled. Turns with zero tool calls render no line at all.
3. **Expanded:** a chronological list of the turn's tool calls. Each row: status dot (green ✓ completed / red ✗ failed / grey cancelled) · raw tool name (`searchAssets`) · human summary (from `requestSummary`/`responseSummary`, e.g. "Lisbon, 5–12 May → 142 results") · duration (from `startedAt`/`completedAt`). Clicking a row toggles a detail block: request summary, response summary, asset/album counts, result size (`estimatedBytes`, `returnedItems`, `truncated`, `omittedFields`), error text, timestamps. A small annotation row at the top shows the strict router decision (matched workflow + via) when present.

Expansion state is per-turn, in-memory only (no persistence). Everything is collapsed by default — this is the "off by default" requirement.

### Removed

- The "Activity summary" block and its phase cards (`agent-activity-block.svelte`, the bulk of `agent-activity-ui.ts`). Replaced by a new, much smaller `agent-turn-timeline` component pair (timeline + row) plus a pure model-builder module.
- The Compact/Expanded/Off visibility modes, their ⋯ menu radio group, and the per-session localStorage persistence (`agent-activity-visibility-ui.ts`).
- The ⋯ "Chat options" menu itself: with the modes gone it would hold only "Details", so the header reverts to a plain Details icon-pill button (info icon, `rounded-full`, aria-label `assistant_details`). This deliberately revisits the 2026-06-09 header rework; Cancel ("Close session") stays as-is.

### Data flow

No new endpoints and no schema changes. The web already loads tool calls and activity events per session and receives live updates over the existing websocket path. A pure builder (`buildAgentTurnTimeline(toolCalls, activityEvents, messages)`) groups tool calls by turn (between user messages, same grouping as today's `agent-session-activity-turns-ui.ts`), computes each turn's state/summary/one-liner, and returns row models. Friendly verbs come from a small tool-name→verb map with the raw tool name as fallback.

### Server fix: close out lifecycle events

When a runner turn settles in `agent-runner.service.ts` — stream completed, stream failed, or session cancelled — the service updates that session's still-`running` lifecycle activity events (`start-processing`, `plan-composing`, `apply-progress`, `runner-recovery`) to a terminal status: `completed` on success, `failed` on error (existing behavior), `skipped` on cancel. The forever-"Running" state becomes impossible at the data level. `strict_*` observability events are not touched (the L3 eval consumes them; they already carry terminal statuses).

### Edge cases

- **Cancel mid-turn:** in-flight tool-call rows render grey "cancelled"; the summary line reads `N steps · cancelled`.
- **Runner death:** tool calls stuck non-terminal render as cancelled once the session itself is in a terminal state.
- **Pure-chat turns** (no tool calls): no summary line, no timeline.
- **Long sessions:** timelines are per-turn and collapsed, so cost is one summary line per turn.

## Testing

- **Model builder (bulk of coverage):** table-driven unit tests — grouping into turns, summary-line text (counts, duration, failed, cancelled), one-liner derivation incl. pre-first-tool-call, router-decision annotation, zero-tool-call turns.
- **Component:** expand/collapse per turn, row detail toggle, failure badge, live update when a websocket event lands mid-turn.
- **Server:** `agent-runner.service` spec — settling a turn closes running lifecycle events for success, failure, and cancel paths; strict events untouched.
- **Removed-surface cleanup:** delete/replace the specs of removed components; the ⋯-menu specs revert to Details-button assertions.

## Out of scope

- New server-side event kinds or richer runner emissions.
- Exposing `redactedRequestMetadata`/`redactedResponseMetadata` raw JSON in the UI.
- Session-wide debug drawer (Layout B) — can layer on later if inline proves insufficient.
- Persisting expansion preferences.
