# Pi agent eval harness (L1)

A live, scorecard-producing eval for the Pi agent's **classification + copy**
layer. It builds the real `createIntentClassifier` and `llm-polish` adapters
against a local OpenAI-compatible model (no Gallery server, no DB) and scores a
battery of real prompts so we can tell whether a change improved or regressed
agent behavior.

See the design: `docs/superpowers/specs/2026-05-29-pi-agent-smoke-eval-harness-design.md`.
This is layer **L1**; L2 (dispatcher + fixture MCP) and L3 (full Gallery session,
read-only) are future phases.

## Run

Point it at any running OpenAI-compatible server (defaults to local llama.cpp on
`127.0.0.1:8080`):

```bash
# from the agent-runner package
pnpm eval                      # all scenarios, prints a scorecard
pnpm eval -- --filter recall   # only the "recall" category (or an id substring)
pnpm eval -- --runs 1          # one run per scenario (fast, noisier)
pnpm eval -- --mode regex      # force regex-only routing (no model calls)
pnpm eval -- --diff            # compare to eval/baseline.json
pnpm eval -- --accept          # write the current scorecard as the new baseline
pnpm eval -- --json            # also dump full results to eval/results/<iso>.json
```

Env overrides: `EVAL_LLAMA_URL`, `EVAL_LLAMA_MODEL`, `EVAL_LLAMA_KEY`,
`EVAL_ROUTER_MODE`, `EVAL_RUNS`.

Exit code is non-zero if any scenario fails its threshold, so it's script/CI
friendly. (Not in CI yet — it needs a local model.)

## How scoring works

- **Deterministic** decisions (regex fast-path / actionable heuristic) are scored
  once.
- **Model-dependent** decisions (LLM classify, polish) are repeated `--runs`
  times; a scenario passes if its success rate ≥ its `threshold` (default 0.67),
  which absorbs model variance.
- Categories: `recall` (right workflow + slots survive `parseSlots`),
  `negatives` (questions/chatter/unsupported → `none`), `slots` (exact normalized
  slot values), `copy` (polish preserves facts + review framing).

## Adding scenarios

Add an object to a file under `scenarios/` (or a new file wired into
`scenarios/index.mjs`):

```js
{
  id: 'recall.trip.greece',
  category: 'recall',
  prompt: 'make an album from my Greece trip',
  expect: { kind: 'create_recent_trip_album', slotsSurvive: true, slots: { placeHint: /greece/i } },
}
```

`expect` keys: `kind` (or `anyKind: [...]`), `slotsSurvive`, `slots` (subset;
string = case-insensitive equality, or a RegExp). Copy scenarios use
`{ summary, expect: { contains, notContains } }`.

## Baseline workflow

`pnpm eval -- --accept` once to snapshot, then after any change
`pnpm eval -- --diff` shows per-scenario and overall deltas
(`recall.trip.japan 33% -> 100%`). Treat a baseline update like a reviewed
snapshot change.
