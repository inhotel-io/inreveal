# Phase A Slice A6 — `visual_cleanup` workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. TDD. `- [ ]` checkboxes.

**Goal:** A hybrid `visual_cleanup` workflow: "trash my blurry photos from last week", "clean up dark/low-quality photos" → resolve a BOUNDED source filtered to low-quality assets → propose a **High-risk reversible `asset.trash`** over the matches. Unbounded ("delete all bad photos") → ask for scope; subjective beyond quality ("delete the ugly ones") → handoff.

## Design decision (resolved after grounding — IMPORTANT)

`readSelectionMetadata` returns a **sample** + aggregate counts (not the full asset list), so client-side filtering would be incomplete. The correct, complete, bounded approach is a **server-side quality filter on the agent `searchAssets` filter**: the resolved selection handle becomes exactly the low-quality matches, and the workflow proposes `asset.trash` over the handle — identical to `trash_assets`, complete by construction, no client-side filtering/sampling. This makes A6 span **server + agent-runner + L1** (the spec framed it agent-runner-only, but the tool reality requires the server filter for correctness).

So A6 = **A6a (server quality filter)** + **A6b (visual_cleanup workflow)** + **L1**.

## Grounded integration points

**Server (A6a):**

- Agent searchAssets filter DTO: `server/src/dtos/agent-tool.dto.ts` — find the searchAssets filter schema (the one with `tagIds`, dates, etc. ~ the `AgentSearchAssetsFilter`/`resolveAssetSearchFilters` request). Add an optional `quality` filter, e.g. `maxSharpness?: int 0-100` and/or `maxQuality?: int` (decide one composite `maxQuality` vs per-metric; recommend **both `maxSharpness` and `maxQuality`** so "blurry"→maxSharpness, "low-quality"→maxQuality, "dark"→a `maxBrightness`). Keep minimal: `maxSharpness`, `maxBrightness`, `maxQuality` (all optional int).
- Asset repo search query: wire the filter to a `LEFT JOIN asset_quality` + `WHERE asset_quality.<metric> <= :threshold` (and require the row exists — unscored assets have null, which should NOT match a "blurry" filter; use `asset_quality.sharpness <= X` which excludes nulls naturally). Find the agent search query (mirror how `tagIds`/rating filters are applied). Likely `search.repository.ts` or the agent metadata search.
- OpenAPI/SDK regen (the searchAssets filter DTO is exposed).
- TDD: medium test — searchAssets with `maxSharpness: 30` returns only assets with sharpness ≤ 30 (excludes null/unscored); default (no filter) unchanged.

**Agent-runner (A6b):** mirror `trash_assets.mjs`:

- New `agent-runner/src/strict-workflows/workflows/visual-cleanup.mjs`: `KIND='visual_cleanup'`, `flow:'hybrid'`.
  - `match`: quality keyword (`blur(ry)/dark/low[- ]?(quality|sharpness|light)/poor[- ]?(exposure|light)/badly (exposed|lit)`) + a trash/cleanup verb + a source. Must NOT steal plain "trash my photos" (→trash_assets) or "duplicates" (→cleanup_duplicates). Reject purely subjective ("ugly/bad ones" without a quality metric) → handoff.
  - `parseSlots`: extract `sourceDescription` + the quality metric (sharpness/brightness/quality).
  - `run`: map the quality metric → a `quality` filter; call the source resolver (mirror `resolveAssetSource`) but with the quality filter injected into the searchAssets call so the handle = low-quality matches; require a bounded source (if the resolver can't bound it / whole-library without a count → needs_input asking for scope); propose `asset.trash` (riskLevel high, `assetSource: {kind:'selectionHandle', selectionHandleId}`) via `proposeAlbumOperations`; gate the plan; empty matches → direct answer / needs_input. NOTE: `resolveAssetSource` (`asset-source-resolver.mjs:359`) currently builds the searchAssets call internally — either (a) extend it to accept an extra `filters` overlay (quality), or (b) have visual_cleanup call searchAssets itself with the bounded filters + quality filter to get a handle. Prefer (a): add an optional `extraFilters` param to `resolveAssetSource` merged into the searchAssets `filters`.
- Registry `registry.mjs`: add `visualCleanupWorkflow` to `WORKFLOW_FACTORIES` **before `trashAssetsWorkflow`** (and after `cleanupDuplicatesWorkflow`) so quality keywords win precedence (first-match-wins).
- Manifest `manifest.mjs`: add a `visual_cleanup` entry (mirror `cleanup_duplicates` :232) with kind/flow/title/classifierDescription/positive+negativeExamples/slots/requiredReadTools/planTool/`matrixRow` (capability "Visual cleanup", tier per A7). Regen `manifest.generated.json` via `pnpm -C server build && pnpm -C server sync:agent-capabilities`.
- Capability-matrix Flow Ownership row + `agent-capability-matrix.spec.ts` green (A7 moves the tier; A6 just adds the row/manifest so the per-entry agreement test passes). Prettier the docs to a fixed point.
- Contract fixture `contract-fixtures.mjs`: ensure `makeContractClient` supports the resolver's searchAssets call returning a handle for the quality-filtered source + `proposeAlbumOperations`. Add config for "resolved low-quality asset count".

**L2 tests (visual-cleanup.test.mjs):** match accepts "trash my blurry photos", "delete dark photos from last month"; rejects unbounded "delete all bad photos" (needs_input/scope) and subjective "delete the ugly ones" (handoff); rejects plain "trash my newest 20" (→trash_assets, match returns undefined) and "trash duplicates" (→cleanup_duplicates); run proposes `asset.trash` over the quality-filtered handle; empty → needs_input/direct answer; quality-not-scored-on-instance → handoff/needs_input disclosing scores aren't ready (the resolver returns empty when the quality filter matches nothing).

**L1 (Qwen at 127.0.0.1:8080 — confirmed reachable):**

- Add recall scenarios to `agent-runner/eval/scenarios/classification-recall.mjs`: "trash my blurry photos" / "delete dark photos from my recent uploads" → `visual_cleanup` (+ slot fidelity for sourceDescription).
- Add negatives to `classification-negatives.mjs`: "trash my newest 20 photos" → `trash_assets` (not visual_cleanup); "trash duplicate photos" → `cleanup_duplicates`.
- Run `node eval/run.mjs --runs 5`, confirm 100%, re-seed `baseline.json` with `node eval/run.mjs --accept` in the same slice.

## Verification gates

- `make check-server && make lint-server && make format-server (prettier) && make check-web` (run `prettier --check .` per package — the A4 lesson: eslint --fix ≠ prettier; svelte-check is a LOCAL NO-OP, rely on CI Lint Web for svelte Record exhaustiveness).
- OpenAPI/SDK + sync:sql regen + commit (searchAssets filter DTO changed).
- `pnpm -C server test` + `test:medium` (exiftool exif specs fail locally — env, ignore).
- `pnpm --dir agent-runner test` (node:test) all green.
- Capability-matrix spec green; manifest.generated.json regenerated & committed.
- L1 100% re-seeded.
- CI jobs that bit us this phase: **Lint Web (svelte Record<QueueName>-style exhaustiveness — also any web map enumerating workflows/tools)**, **Test i18n (prettier-sort en.json via `pnpm --filter=immich-i18n format:fix`)**, **Test & Lint Server (prettier --check .)**, **OpenAPI Clients / SQL Schema Checks (commit ALL regen output)**, **agent-capability-matrix.spec**.

## Self-review note

The spec lists A6 as agent-runner-only; the server-side quality filter (A6a) is an addition discovered during grounding to make the feature correct (complete + bounded). It is the "most reasonable to make the feature work best" choice. If a reviewer prefers keeping A6 agent-runner-only, the fallback is a capped client-side filter (searchAssets returns ids up to a cap → readAssetMetadata(ids, fields:['quality']) → filter → trash explicit ids; reject if count > cap), but that is more code and less robust.
