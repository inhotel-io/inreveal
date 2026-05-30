// L3 read-only scenarios — run against a live Gallery stack via `--layer L3`.
//
// Two kinds of assertion:
//   - routing (`kind` / `anyKind`): data-independent. Classification happens
//     before any library lookup, so these hold against ANY instance (even an
//     empty dev stack) as long as the runner is wired and classifying.
//   - plan-proposed (`planProposed: true`): data-DEPENDENT. The strict workflow
//     must actually find matching data (a detectable trip, a resolvable album)
//     to propose a plan. These are meant for a real library with "lots of data"
//     (the personal instance) and may legitimately not propose on an empty
//     stack — that's a missing-data signal, not a routing regression.
//
// L3 activity summaries are scrubbed of slot values, so we never assert exact
// slots here (that's L1's job). `none` is asserted for negatives — the agent
// must NOT fabricate a strict workflow for questions/chatter/unsupported intents.
export default [
  // --- routing: the agent reaches the right strict workflow -----------------
  {
    id: 'l3.recall.trip.usa',
    category: 'l3.recall',
    prompt: 'Create an album for my recent trip to USA',
    expect: { kind: 'create_recent_trip_album' },
  },
  {
    id: 'l3.recall.trip.noplace',
    category: 'l3.recall',
    prompt: 'Make an album for my recent trip',
    expect: { kind: 'create_recent_trip_album' },
  },
  {
    id: 'l3.recall.trip.uncommon-verb',
    category: 'l3.recall',
    prompt: 'throw the pics from our Italy getaway into a new album',
    expect: { kind: 'create_recent_trip_album' },
  },
  {
    id: 'l3.recall.rename',
    category: 'l3.recall',
    prompt: 'rename the Family album to Family 2026',
    expect: { kind: 'rename_or_describe_album' },
  },
  {
    id: 'l3.recall.add.newest20',
    category: 'l3.recall',
    prompt: 'add my newest 20 photos to Family',
    expect: { kind: 'add_photos_to_album' },
  },
  {
    // Heavy paraphrase with no trip keyword for the regex fast-path — forces the
    // LIVE model classifier (via=llm), unlike the canonical prompts above.
    id: 'l3.recall.trip.lisbon.llm',
    category: 'l3.recall',
    prompt: 'put together an album from our weekend away in Lisbon',
    expect: { kind: 'create_recent_trip_album' },
  },
  {
    // The describe variant (vs rename) — end-to-end coverage of the describe
    // slot path. Routing happens before any album lookup, so it holds whether or
    // not an "Italy album" exists.
    id: 'l3.recall.describe.italy',
    category: 'l3.recall',
    prompt: 'set the description on my Italy album to Summer 2026 memories',
    expect: { kind: 'rename_or_describe_album' },
  },

  // --- negatives: must NOT fabricate a strict workflow ----------------------
  {
    id: 'l3.neg.count',
    category: 'l3.negatives',
    prompt: 'how many photos do I have?',
    expect: { kind: 'none' },
  },
  {
    id: 'l3.neg.thanks',
    category: 'l3.negatives',
    prompt: 'thanks, that looks great!',
    expect: { kind: 'none' },
  },
  {
    id: 'l3.neg.favorite',
    category: 'l3.negatives',
    prompt: 'favorite my best shots from last year',
    expect: { kind: 'none' },
  },
  {
    id: 'l3.neg.search',
    category: 'l3.negatives',
    prompt: 'find my Sony photos from May',
    expect: { kind: 'none' },
  },
  {
    id: 'l3.neg.subjective',
    category: 'l3.negatives',
    prompt: 'show me the good ones',
    expect: { kind: 'none' },
  },
  {
    id: 'l3.neg.where',
    category: 'l3.negatives',
    prompt: 'where were these taken?',
    expect: { kind: 'none' },
  },
  {
    // Unsupported AND destructive — the strict router must not fabricate a
    // workflow for it (there is no delete workflow); it falls to open handling.
    id: 'l3.neg.delete',
    category: 'l3.negatives',
    prompt: 'delete all my screenshots',
    expect: { kind: 'none' },
  },

  // --- plan-proposed: end-to-end against a real library ---------------------
  // Routes to the trip workflow AND proposes a reviewable plan (never applied).
  // A PLACE-specified trip is the robust plan probe: the no-place form ("my most
  // recent trip") is correctly ambiguous on a many-trip library and the agent
  // returns needs_input rather than guessing (verified live) — so we assert the
  // plan on a place-qualified prompt the library can satisfy unambiguously.
  {
    id: 'l3.plan.trip.usa',
    category: 'l3.plan',
    prompt: 'Create an album for my recent trip to USA',
    expect: { kind: 'create_recent_trip_album', planProposed: true },
    // Needs library data; tolerate variance across repeats.
    threshold: 0.5,
  },
  {
    // rename_or_describe_album end-to-end (describe arm): proposes an album.update
    // setting a description on a REAL album — proposed, never applied. `{album}`
    // resolves read-only to the user's most-populated album. Exercises the
    // describe-slot value capture all the way to a persisted plan.
    // NOTE: an add_photos plan scenario was intentionally NOT added — on the
    // current build the recency source ("newest 20") fails in the workflow's
    // resolveAssetSearchFilters call, so add stays routing-only (l3.recall.add.*)
    // until that's fixed. Don't assert a known-broken path as "expected".
    id: 'l3.plan.describe.discovered',
    category: 'l3.plan',
    prompt: 'set the description on the {album} album to Favorite memories',
    expect: { kind: 'rename_or_describe_album', planProposed: true },
    threshold: 0.5,
  },

  // --- multi-turn: ask (needs_input) -> supply a place -> plan ---------------
  // Turn 1 is correctly ambiguous: with no place and no single confident trip,
  // the workflow asks for a place/dates rather than guessing (verified live).
  // Turn 2 supplies a concrete place and the workflow proposes a plan. Tests the
  // converse() path — a session recovering from needs_input and planning on the
  // next turn (never applied). (The candidate-selection *resume* path — "the
  // first one" — needs a place with several distinct trips, which is
  // library-specific, so we exercise the robust place-recovery flow instead.)
  {
    id: 'l3.multiturn.trip.recover',
    category: 'l3.multiturn',
    turns: ['Make an album for my recent trip', 'Create an album for my recent trip to USA'],
    expect: { kind: 'create_recent_trip_album', planProposed: true },
    threshold: 0.5,
  },
];
