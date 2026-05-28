# Pi Agent Trip Candidate Detection Design

Status: draft design
Date: 2026-05-28
Branch: `explore/pi-agent-brainstorm`

## Purpose

Pi should be able to handle requests like:

> Create an album of the top highlights for my recent trip to USA.

without asking the user to provide dates, a count, and media-type preferences up
front. A trip request is already reviewable: Gallery can infer a likely source,
curate suggested highlights, create an editable plan, and let the user correct
the plan before applying it.

The missing piece is a server-side trip detector. The LLM should not infer trip
windows from tiny samples or raw asset IDs. Gallery should detect likely trip
candidates from geotagged assets, return compact candidate summaries and
selection handles, and let Pi orchestrate the album workflow.

## Current State

Gallery already has useful recent-trip logic in `RecentTripMemoryRule`:

- It builds a likely home baseline from prior location clusters.
- It searches recent location clusters.
- It treats non-home clusters with enough assets and day coverage as trip
  candidates.
- It fetches assets for the chosen location.
- It curates representative assets by collapsing short bursts and spreading
  picks across days.

That logic is currently shaped for daily memory generation, not interactive
assistant workflows:

- It finds at most one recent city/country candidate for a memory.
- It uses a fixed 30-day recent window and a 90-day home baseline.
- It groups by `country + city`, which misses multi-city or multi-country trips
  that form one continuous travel window.
- It returns asset IDs for memory creation, while Pi needs selection handles and
  compact metadata.
- It is coupled to memory cooldown and dedupe behavior.

## Goals

- Add reusable backend trip candidate detection that is independent of Pi, MCP,
  memories, and future album suggestions.
- Support "my recent trip", "my recent trip to USA", and multi-country trips
  when the assets form a contiguous travel window.
- Use existing geotag/date metadata only; no image understanding or geocoding.
- Return compact trip candidates with date window, places, counts, score,
  confidence, dedupe key, and source descriptor.
- Add a handle-first MCP read tool so Pi can resolve trip sources without seeing
  raw asset IDs.
- Let Pi proceed with sensible defaults for highlight album requests: default
  to 10 suggested highlights and photos/videos matching the source unless the
  user says otherwise.
- Reuse the detector from `RecentTripMemoryRule` where practical.
- Keep proactive album suggestions out of the shipped scope while preserving a
  candidate shape they can consume later.
- Use TDD for each implementation slice.

## Non-Goals

- No proactive album suggestion UI, database model, accept/dismiss endpoints, or
  background suggestion job in this feature.
- No place-name geocoding. Place matching uses existing asset metadata labels
  such as country, state, and city, plus safe normalization/aliases where
  already available.
- No flight, map-route, calendar, or semantic travel understanding.
- No direct album creation or automatic apply. All writes remain reviewable
  operation plans.
- No raw asset ID arrays in model-facing trip tool responses.
- No objective "best photo" scoring. Highlight selection remains
  metadata-based suggested curation until a future quality-analysis capability
  exists.
- No unbounded whole-library processing. The detector uses configured lookback
  and result limits.

## User-Facing Behavior

### Recent Trip Highlight Album

For:

> Create an album of the top highlights for my recent trip to USA.

Pi should:

1. Call the trip candidate tool with a place hint for USA.
2. If one high-confidence candidate exists, curate the default 10 metadata-only
   highlights from that candidate's selection handle.
3. Propose a reviewable album plan, for example `USA Highlights`.
4. Explain assumptions briefly:

> I found a likely USA trip from May 3-12 with 184 assets and proposed 10
> metadata-only suggested highlights. Review the album plan before applying it.

Pi should not ask for dates or count before trying this flow.

### Recent Trip Without Place

For:

> Make a highlights album from my recent trip.

Pi should call the same tool without a place hint. If the detector finds one
clear recent travel window, Pi proceeds. If multiple similarly strong candidates
exist, Pi asks one question that includes concrete options:

> I found a few likely trips: USA in May, France/Italy in April, and Berlin in
> March. Which one should I use?

### When To Ask

Pi should ask only after the detector runs when:

- no trip candidate is found;
- multiple candidates are too close in score/confidence;
- the best candidate exceeds safe curation limits and cannot be narrowed
  automatically;
- the user asks for an invalid count such as zero, negative, or more than the
  configured highlight maximum;
- the place hint cannot match metadata labels with enough confidence.

## Backend Design

### `TripCandidateService`

Introduce a reusable domain service, not an agent-specific service:

```ts
type TripCandidateRequest = {
  ownerId: string;
  targetDate?: Date;
  lookbackDays?: number;
  placeHint?: string;
  maxCandidates?: number;
};

type TripCandidate = {
  dedupeKey: string;
  title: string;
  subtitle: string;
  countries: string[];
  states: string[];
  cities: string[];
  takenAfter: Date;
  takenBefore: Date;
  assetCount: number;
  dayCount: number;
  score: number;
  confidence: 'high' | 'medium' | 'low';
  source: TripCandidateSource;
};
```

`TripCandidateSource` should be a stable descriptor that other consumers can
materialize later:

```ts
type TripCandidateSource = {
  kind: 'tripCandidate';
  dedupeKey: string;
  takenAfter: Date;
  takenBefore: Date;
  places: Array<{
    country: string;
    state?: string | null;
    city?: string | null;
  }>;
  filters?: AgentSearchAssetsFilters;
  placeLabels: string[];
};
```

The service may use asset IDs internally for scoring or memory representative
selection, but it must not expose raw IDs to model-facing callers.

`filters` is present only when the candidate can be represented by the current
search filter shape. Multi-country and other OR-style candidates should use the
`takenAfter`/`takenBefore` plus `places` descriptor and be materialized by a
dedicated repository query or selection-handle creation path.

### Algorithm

V1 should stay deterministic and metadata-based:

1. **Build home baseline.** Reuse the existing baseline idea from
   `RecentTripMemoryRule`: inspect location clusters before the recent window
   and identify the dominant home country/city. If the baseline is ambiguous,
   continue with lower confidence instead of failing the whole tool.
2. **Fetch recent geotagged day/place buckets.** Look back from `targetDate`
   using a bounded default, such as 180 days. Include timeline assets with
   location metadata and preview availability, matching existing memory
   constraints.
3. **Apply place hint.** If the user supplied "USA" or another place phrase,
   match it against normalized country/state/city labels. Do not geocode unknown
   places.
4. **Mark travel buckets.** Treat non-home buckets as travel. If a place hint is
   supplied, matching buckets may be travel even when they are in the home
   country, but home-city dominance lowers confidence.
5. **Merge contiguous travel days.** Merge buckets into trip windows when dates
   are close enough. Allow small gaps, such as one no-photo day, so travel days
   do not fragment.
6. **Support multi-place trips.** A candidate window can contain multiple
   countries, states, and cities. The candidate label should summarize the
   strongest places rather than splitting every city into separate trips.
7. **Score candidates.** Prefer recency, asset count, day count, place-hint
   match, non-home confidence, and continuity. Penalize tiny one-day clusters
   unless the user provided an exact place hint.
8. **Create source descriptors.** Convert each candidate to a search source
   using its date window and place constraints. For multi-country candidates,
   materialization may need a dedicated repository query or a selection handle
   from the candidate asset set because current search filters do not express
   country OR country cleanly.

### Reusing Memory Logic

`RecentTripMemoryRule` should not remain the owner of trip detection. Extract
shared behavior into `TripCandidateService` and make the memory rule consume it.

Memory-specific behavior remains in the memory rule:

- daily rule cap;
- cooldown against recently created rule memories;
- memory title/subtitle formatting if different from Pi copy;
- representative memory asset selection.

Trip detection behavior moves to the shared service:

- home baseline detection;
- location/day bucketing;
- trip-window merging;
- scoring and confidence;
- candidate dedupe key generation.

## MCP Tool

Add a read tool named `findTripCandidates`.

Request:

```ts
type FindTripCandidatesRequest = {
  placeHint?: string;
  lookbackDays?: number;
  maxCandidates?: number;
  targetDate?: string;
};
```

Defaults:

- `lookbackDays`: 180
- `maxCandidates`: 3
- `targetDate`: now

Response:

```ts
type FindTripCandidatesResponse = {
  status: 'success';
  summary: string;
  candidates: Array<{
    label: string;
    subtitle: string;
    countries: string[];
    states: string[];
    cities: string[];
    takenAfter: string;
    takenBefore: string;
    assetCount: number;
    dayCount: number;
    score: number;
    confidence: 'high' | 'medium' | 'low';
    dedupeKey: string;
    selectionHandle: {
      id: string;
      sourceRef: string;
      assetCount: number;
      expiresAt: string;
    };
  }>;
};
```

If no candidates are found, return `status: 'success'` with an empty candidate
array and a useful summary. This is not an error.

If the request is invalid, return the normal Gallery MCP validation result with
retryable hints.

The tool must create selection handles server-side. Pi should pass the selected
candidate handle to `curateSelection`, then pass the curated handle to
`proposeAlbumFromSelection`.

## Pi Guidance

Update the runner prompt and generated MCP cheat sheet guidance:

- For "recent trip" requests, call `findTripCandidates` before asking for
  dates.
- If the user asks for "top highlights" without a count, default to 10 after a
  trip candidate is found.
- If the top candidate has high confidence, proceed with a reviewable plan.
- If several candidates are close, ask one question with candidate labels.
- Disclose metadata-only curation and assumptions in the final message.
- Never copy asset IDs from trip detection or search results.

## Future Album Suggestions

This feature should not implement album suggestions, but the architecture should
not block them.

Future album suggestions can consume `TripCandidateService` from a background
job and persist suggestion records with:

- dedupe key;
- title/subtitle;
- date window;
- place labels;
- source descriptor;
- preview asset references;
- accepted/dismissed state.

Because suggestions need lifecycle and persistence, they should be a Gallery
product feature, not a Pi conversation feature. Pi and suggestions should share
the detector, not share MCP plumbing.

## TDD And Implementation Slices

Every slice starts with focused failing tests before production code.

### Slice 1: Trip Candidate Service Extraction

Tests:

- Detects a single non-home trip using baseline and recent location buckets.
- Returns no high-confidence trip for home-only recent assets.
- Handles ambiguous home baseline by lowering confidence instead of crashing.
- Generates stable dedupe keys for the same trip window.

Implementation:

- Add `TripCandidateService`.
- Move reusable home baseline and scoring logic out of
  `RecentTripMemoryRule`.
- Keep memory rule behavior unchanged from the user's point of view.

### Slice 2: Multi-Day And Multi-Place Trip Windows

Tests:

- Merges adjacent travel days into one candidate.
- Allows a small no-photo gap inside one trip.
- Keeps clearly separate trips as separate candidates.
- Produces one multi-country candidate when a continuous trip crosses borders.
- Summarizes countries/cities without duplicating labels.

Implementation:

- Add day/place bucketing.
- Add window merging and place summarization.
- Add scoring for recency, day count, asset count, place hint, and continuity.

### Slice 3: Place Hint Filtering

Tests:

- `"USA"` matches assets whose country metadata is `USA` or an accepted
  normalized equivalent.
- A city hint matches city metadata without geocoding.
- An unknown place hint returns no candidates with a summary, not a server
  error.
- A place hint can find a trip in the home country but with lower confidence if
  it overlaps the home city.

Implementation:

- Add conservative label normalization.
- Apply place hints before candidate scoring.
- Do not call external geocoding services.

### Slice 4: MCP Read Tool

Tests:

- `findTripCandidates` returns candidate summaries and selection handles.
- Response contains no raw asset IDs.
- Empty result returns `status: success` and `candidates: []`.
- Invalid `lookbackDays`, `maxCandidates`, and `targetDate` values return
  validation errors.
- Selection handles are session-scoped and expire like other agent handles.

Implementation:

- Add DTOs, contract docs, registry entry, service method, and controller path.
- Materialize candidate sources into selection handles.
- Regenerate OpenAPI/client artifacts as required by the repo.

### Slice 5: Pi Flow Integration

Tests:

- Prompt: "Create an album of the top highlights for my recent trip to USA"
  calls `findTripCandidates -> curateSelection -> proposeAlbumFromSelection`.
- The flow defaults to 10 highlights when no count is provided.
- The flow creates a reviewable plan and does not ask for dates first.
- Multiple close candidates produce one clarifying question with labels.
- No candidate produces an explanatory answer and no plan.
- The provider-visible transcript contains no raw asset IDs.

Implementation:

- Update runner prompt guidance.
- Update deterministic e2e runtime for the new flow.
- Update generated prompt cheat sheet and relevant docs.

## Edge Cases

- Assets without location metadata are ignored by trip detection but remain
  available to normal search tools.
- One-day clusters are low confidence unless the user provides a precise place
  hint and the asset count is meaningful.
- Imported old scans may appear recent by upload date but should not affect trip
  detection because the detector uses taken dates.
- Multiple trips to the same place are separated by date windows and dedupe keys.
- Trips spanning a year boundary should produce one date window if the travel
  days are contiguous.
- A very large candidate should still return a handle; curation limits decide
  whether Pi can proceed or must ask to narrow.
- Existing memory cooldown should not suppress MCP trip candidates. Cooldown is
  only for creating memory cards.

## Manual Testing

- On a local seeded library, create home assets plus a recent multi-day USA
  trip and verify Pi proposes a `USA Highlights` album without asking for
  dates.
- On a library with two recent trips, verify Pi asks which concrete trip to use.
- On a library with a multi-country continuous trip, verify one candidate is
  returned with multiple countries.
- On Pierre's personal instance, ask:
  "Create an album of the top highlights for my recent trip to USA."
  Confirm Pi uses trip detection, creates a reviewable plan, and avoids raw IDs.
- Verify the existing recent-trip memory job still creates equivalent memory
  cards after the service extraction.

## Acceptance Criteria

- Pi can resolve "recent trip to USA" through a server-side trip candidate tool
  and create a reviewable highlights album plan with no up-front clarification.
- Trip candidates are handle-first and do not expose asset ID arrays to the LLM.
- Multi-country trips can be represented as one candidate when date continuity
  indicates one trip.
- Existing recent-trip memory behavior is preserved or intentionally improved
  by tests.
- Album suggestions are not implemented, but future suggestion jobs can consume
  the same service without depending on Pi or MCP.
