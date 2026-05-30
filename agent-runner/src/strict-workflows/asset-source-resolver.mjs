// Shared asset source-resolver for the hybrid workflows that turn a free-text
// asset source ("my newest 20 photos") into a selection handle. Owned here so
// add_photos / archive / favorite / tag / album-from-source all resolve sources
// identically. Uses the REAL searchAssets contract (metadata mode, no free-text
// query) — the lesson from the add_photos recency bug.
//
// resolveAssetSource(...) -> { status: 'resolved', selectionHandleId, assetCount }
//                          | { status: 'empty' }
//                          | { status: 'handoff', reason }
//
// It does NOT catch tool errors: a thrown searchAssets error propagates so the
// caller maps it to its own `failed` outcome.

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

// Subjective/visual source terms Gallery cannot resolve from metadata alone — a
// subjective source hands off rather than fabricate a metadata search.
export const SUBJECTIVE_PATTERN =
  /\b(?:best|good|nice|great|favou?rite|favou?rites|highlights?|blurry|bad|cute|pretty|beautiful|nicest|prettiest)\b/i;

// A recency source ("newest/latest/last/most recent N") is the one metadata
// source this strict path resolves deterministically: newest-first, capped to N,
// via a plain metadata search (no filters, no free-text query). It requires an
// explicit count so we never guess how many. Date / location / semantic sources
// need filters this resolver cannot extract from free text (until later slices)
// and hand off to open orchestration instead.
export const RECENCY_PATTERN = /\b(?:newest|latest|last|most\s+recent|recent)\b/i;
const COUNT_PATTERN = /\b(\d{1,4})\b/;
export const MAX_RECENCY_LIMIT = 1000;

export const parseRecencyLimit = (source) => {
  if (!RECENCY_PATTERN.test(source)) {
    return undefined;
  }
  const match = COUNT_PATTERN.exec(source);
  if (!match) {
    return undefined;
  }
  const count = Number(match[1]);
  return Number.isInteger(count) && count >= 1 ? Math.min(count, MAX_RECENCY_LIMIT) : undefined;
};

export const resolveAssetSource = async ({ client, sourceDescription, signal }) => {
  const source = clean(sourceDescription);

  // Subjective sources hand off to open orchestration — never plan a guess.
  if (SUBJECTIVE_PATTERN.test(source)) {
    return { status: 'handoff', reason: `Source "${source}" is subjective and cannot be resolved from metadata alone.` };
  }

  // Only a recency source is deterministically resolvable here. Date, location,
  // and semantic sources hand off (the LLM composes the searchAssets call).
  const recencyLimit = parseRecencyLimit(source);
  if (recencyLimit === undefined) {
    return {
      status: 'handoff',
      reason: `Source "${source}" needs filters this workflow cannot resolve from metadata alone.`,
    };
  }

  // Resolve into a selection handle via a bounded metadata search (newest-first,
  // capped to N). No free-text query: metadata mode does not accept one, and
  // there are no named entities to resolve. A thrown tool error propagates.
  const handleResult = await client.call(
    'searchAssets',
    { mode: 'metadata', order: 'desc', limit: recencyLimit, detail: 'handle' },
    { signal },
  );

  const selectionHandle = handleResult?.selectionHandle;
  const selectionHandleId = clean(selectionHandle?.id);
  const assetCount = typeof selectionHandle?.assetCount === 'number' ? selectionHandle.assetCount : undefined;

  if (!selectionHandleId || assetCount === 0) {
    return { status: 'empty' };
  }

  return { status: 'resolved', selectionHandleId, assetCount };
};
