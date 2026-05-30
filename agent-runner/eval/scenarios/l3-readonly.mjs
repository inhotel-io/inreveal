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
import config from '../config.mjs';

// Membership/role plan-proposed is asserted only on the local seeded stack (known
// members + a seeded non-owner). Against personal (single user = owner), those
// scenarios assert routing only.
const SEEDED = config.l3.seeded;

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
  {
    id: 'l3.recall.archive',
    category: 'l3.recall',
    prompt: 'archive my newest 20 photos',
    expect: { kind: 'archive_assets' },
  },
  {
    id: 'l3.recall.favorite',
    category: 'l3.recall',
    prompt: 'favorite my newest 10 photos',
    expect: { kind: 'favorite_assets' },
  },
  {
    id: 'l3.recall.tag',
    category: 'l3.recall',
    prompt: 'tag my newest 20 photos as "eval-l3"',
    expect: { kind: 'tag_assets' },
  },
  {
    id: 'l3.recall.space.describe',
    category: 'l3.recall',
    prompt: 'set the description on the {space} space to Shared memories',
    expect: { kind: 'rename_or_describe_space' },
  },
  {
    id: 'l3.recall.members.add',
    category: 'l3.recall',
    prompt: 'add {user} to the {space} space as editor',
    expect: { kind: 'manage_space_members' },
  },
  {
    id: 'l3.recall.role',
    category: 'l3.recall',
    prompt: 'make {user} an editor in the {space} space',
    expect: { kind: 'change_member_role' },
  },
  {
    id: 'l3.recall.createalbum',
    category: 'l3.recall',
    prompt: 'make an album of my newest 20 photos called eval-l3',
    expect: { kind: 'create_album_from_source' },
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
  {
    // Subjective archive source — declines (regex) / manifest negative (LLM).
    id: 'l3.neg.archive.subjective',
    category: 'l3.negatives',
    prompt: 'archive the best ones',
    expect: { kind: 'none' },
  },
  {
    // Tag REMOVAL is out of scope (add-only) — must not route to tag_assets.
    id: 'l3.neg.tag.removal',
    category: 'l3.negatives',
    prompt: 'remove the Travel tag from my newest 20',
    expect: { kind: 'none' },
  },
  {
    // Adding photos to a space is unsupported; the photo-source guard keeps it out
    // of manage_space_members (routes to add_photos or none, never a member op).
    id: 'l3.neg.space.add-photos',
    category: 'l3.negatives',
    prompt: 'add my newest 20 photos to the {space} space',
    expect: { anyKind: ['none', 'add_photos_to_album'] },
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
    id: 'l3.plan.describe.discovered',
    category: 'l3.plan',
    prompt: 'set the description on the {album} album to Favorite memories',
    expect: { kind: 'rename_or_describe_album', planProposed: true },
    threshold: 0.5,
  },
  {
    // add_photos_to_album end-to-end, recency arm: "newest N" resolves via a
    // bounded metadata search (newest-first) into a selection handle and proposes
    // a duplicate-safe album.addAssets — proposed, never applied. `{album}` is a
    // real album. (This is the path the resolveAssetSearchFilters bug broke; it
    // now exercises the Option-1 recency fix end-to-end.)
    id: 'l3.plan.add.recency',
    category: 'l3.plan',
    prompt: 'add my newest 20 photos to {album}',
    expect: { kind: 'add_photos_to_album', planProposed: true },
    threshold: 0.5,
  },
  {
    // archive_assets end-to-end: a recency source resolves to a selection handle
    // and proposes a batch asset.setArchive — proposed, never applied.
    id: 'l3.plan.archive.recency',
    category: 'l3.plan',
    prompt: 'archive my newest 20 photos',
    expect: { kind: 'archive_assets', planProposed: true },
    threshold: 0.5,
  },
  {
    // favorite_assets end-to-end: recency → batch asset.setFavorite plan.
    id: 'l3.plan.favorite.recency',
    category: 'l3.plan',
    prompt: 'favorite my newest 10 photos',
    expect: { kind: 'favorite_assets', planProposed: true },
    threshold: 0.5,
  },
  {
    // tag_assets end-to-end: recency → batch asset.addTag plan (a distinctive tag
    // name; the plan is proposed only, so no tag is created).
    id: 'l3.plan.tag.recency',
    category: 'l3.plan',
    prompt: 'tag my newest 20 photos as "eval-l3"',
    expect: { kind: 'tag_assets', planProposed: true },
    threshold: 0.5,
  },
  {
    // rename_or_describe_space end-to-end: proposes space.updateDetails setting a
    // description on a discovered {space} — proposed, never applied. Works on any
    // instance that has a space.
    id: 'l3.plan.describe.space',
    category: 'l3.plan',
    prompt: 'set the description on the {space} space to L3 eval note',
    expect: { kind: 'rename_or_describe_space', planProposed: true },
    threshold: 0.5,
  },
  {
    // manage_space_members end-to-end. plan-proposed only on the local seeded stack
    // (a {user} not already in {space}); routing-only on personal (single user).
    id: 'l3.plan.members.add',
    category: 'l3.plan',
    prompt: 'add {user} to the {space} space as editor',
    expect: { kind: 'manage_space_members', planProposed: SEEDED ? true : undefined },
    threshold: 0.5,
  },
  {
    // change_member_role end-to-end. plan-proposed only on the local seeded stack
    // (a {user} who IS a member with a different role); routing-only on personal.
    id: 'l3.plan.role.make',
    category: 'l3.plan',
    prompt: 'make {user} an editor in the {space} space',
    expect: { kind: 'change_member_role', planProposed: SEEDED ? true : undefined },
    threshold: 0.5,
  },
  {
    // create_album_from_source end-to-end: recency → album.create + album.addAssets
    // from the handle — proposed, never applied.
    id: 'l3.plan.createalbum',
    category: 'l3.plan',
    prompt: 'make an album of my newest 20 photos called eval-l3',
    expect: { kind: 'create_album_from_source', planProposed: true },
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

  // --- entity-source routing + plan-proposed --------------------------------
  {
    id: 'l3.recall.archive.entity',
    category: 'l3.recall',
    prompt: 'archive my Berlin photos',
    expect: { kind: 'archive_assets' },
  },
  {
    // tag_assets entity-source: resolveAssetSearchFilters → searchAssets handle
    // → addTag plan, proposed never applied. `{album}` discovery token resolves
    // the album entity live.
    id: 'l3.plan.tag.entity',
    category: 'l3.plan',
    prompt: 'tag photos in the {album} album as eval-l3',
    expect: { kind: 'tag_assets', planProposed: true },
    threshold: 0.5,
  },
];
