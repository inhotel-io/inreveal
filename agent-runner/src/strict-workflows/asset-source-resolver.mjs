// Shared asset source-resolver for the hybrid workflows that turn a free-text
// asset source ("my newest 20 photos", "my photos from 2024") into a selection
// handle. Owned here so add_photos / archive / favorite / tag / album-from-source
// all resolve sources identically. Uses the REAL searchAssets contract (metadata
// mode, no free-text query) — the lesson from the add_photos recency bug.
//
// resolveAssetSource(...) -> { status: 'resolved', selectionHandleId, assetCount }
//                          | { status: 'empty' }
//                          | { status: 'handoff', reason }
//
// Clean-source gate: a source resolves only when it is composed ENTIRELY of
// recency / date / generic-noun / filler tokens. Any substantive residual (a
// place, a name, a tag, a type-specific noun like "videos") means the source has
// an unresolvable qualifier and hands off — it never resolves by the recognized
// part alone (which would over-resolve, e.g. "archive my Berlin photos from last
// weekend" must not archive all of last weekend). The gate errs toward handoff.
//
// It does NOT catch tool errors: a thrown searchAssets error propagates so the
// caller maps it to its own `failed` outcome.

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

// Subjective/visual source terms Gallery cannot resolve from metadata alone.
export const SUBJECTIVE_PATTERN =
  /\b(?:best|good|nice|great|favou?rite|favou?rites|highlights?|blurry|bad|cute|pretty|beautiful|nicest|prettiest)\b/i;

// Recency ("newest/latest/last/most recent N"): newest-first, capped to N. An
// explicit count is required so we never guess how many.
export const RECENCY_PATTERN = /\b(?:newest|latest|last|most\s+recent|recent)\b/i;
const RECENCY_PATTERN_G = /\b(?:newest|latest|last|most\s+recent|recent)\b/gi;
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

// --- relative date parsing (pure; UTC; injected `now`) ----------------------

const MONTHS = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4,
  jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};
const MONTH_YEAR_RE =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(20\d{2})\b/;
const YEAR_RE = /\b(20\d{2})\b/;

const dayStart = (y, m, d) => new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
const dayEnd = (y, m, d) => new Date(Date.UTC(y, m, d, 23, 59, 59, 999));
const monthRange = (y, m) => ({ takenAfter: dayStart(y, m, 1), takenBefore: dayEnd(y, m + 1, 0) });
const dayRange = (date) => ({
  takenAfter: dayStart(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  takenBefore: dayEnd(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
});
const DAY_MS = 86_400_000;

export const parseDateRange = (source, now = new Date()) => {
  const text = String(source ?? '').toLowerCase();

  const monthYear = MONTH_YEAR_RE.exec(text);
  if (monthYear) {
    return monthRange(Number(monthYear[2]), MONTHS[monthYear[1]]);
  }
  const year = YEAR_RE.exec(text);
  if (year) {
    return { takenAfter: dayStart(Number(year[1]), 0, 1), takenBefore: dayEnd(Number(year[1]), 11, 31) };
  }
  if (/\byesterday\b/.test(text)) {
    return dayRange(new Date(now.getTime() - DAY_MS));
  }
  // Weeks start Monday.
  const thisMonday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7)),
  );
  if (/\blast\s+weekend\b/.test(text)) {
    const sunday = new Date(thisMonday.getTime() - DAY_MS);
    const saturday = new Date(sunday.getTime() - DAY_MS);
    return { takenAfter: dayRange(saturday).takenAfter, takenBefore: dayRange(sunday).takenBefore };
  }
  if (/\blast\s+week\b/.test(text)) {
    const monday = new Date(thisMonday.getTime() - 7 * DAY_MS);
    const sunday = new Date(thisMonday.getTime() - DAY_MS);
    return { takenAfter: dayRange(monday).takenAfter, takenBefore: dayRange(sunday).takenBefore };
  }
  if (/\bthis\s+month\b/.test(text)) {
    return monthRange(now.getUTCFullYear(), now.getUTCMonth());
  }
  if (/\blast\s+month\b/.test(text)) {
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    return monthRange(prev.getUTCFullYear(), prev.getUTCMonth());
  }
  return undefined;
};

// --- clean-source gate ------------------------------------------------------

// Generic media nouns are filler (a recency/date source can carry them). Type-
// specific nouns ("videos/images/clips") are NOT here — they remain substantive
// until Slice 4 makes them a `type` filter, so a type-qualified source hands off.
const GENERIC_NOUNS = /\b(?:photos?|pics?|pictures?|snaps?|shots?)\b/gi;
const STOPWORDS =
  /\b(?:my|the|a|an|all|of|from|in|on|during|some|please|that|this|these|those|i|me|we|our|us|took|taken|and|to|with)\b/gi;
const DATE_STRIP = new RegExp(
  [
    MONTH_YEAR_RE.source,
    YEAR_RE.source,
    'yesterday',
    'last\\s+weekend',
    'last\\s+week',
    'this\\s+month',
    'last\\s+month',
  ].join('|'),
  'gi',
);

// A source is "clean" when, after removing recency / date / generic-noun / filler
// tokens, nothing substantive remains. Date phrases are stripped first (so the
// "last" in "last weekend" is consumed before the recency strip touches it).
const isCleanSource = (source) => {
  const residual = String(source ?? '')
    .toLowerCase()
    .replace(DATE_STRIP, ' ')
    .replace(RECENCY_PATTERN_G, ' ')
    .replace(/\b\d{1,4}\b/g, ' ')
    .replace(GENERIC_NOUNS, ' ')
    .replace(STOPWORDS, ' ')
    .replace(/[^a-z]+/g, ' ')
    .trim();
  return residual.length === 0;
};

export const resolveAssetSource = async ({ client, sourceDescription, signal, now = new Date() }) => {
  const source = clean(sourceDescription);

  // Subjective sources hand off — never plan a guess.
  if (SUBJECTIVE_PATTERN.test(source)) {
    return { status: 'handoff', reason: `Source "${source}" is subjective and cannot be resolved from metadata alone.` };
  }

  const recencyLimit = parseRecencyLimit(source);
  const dateRange = parseDateRange(source, now);

  // Clean-source gate: an unresolvable qualifier (place/name/tag/type) hands off
  // rather than over-resolve by the recognized recency/date part alone.
  if (!isCleanSource(source)) {
    return {
      status: 'handoff',
      reason: `Source "${source}" includes terms this workflow cannot resolve from metadata alone.`,
    };
  }
  // Clean but unbounded (no count and no date) — nothing to bound a search by.
  if (recencyLimit === undefined && dateRange === undefined) {
    return { status: 'handoff', reason: `Source "${source}" needs a count or date range this workflow can bound.` };
  }

  // Resolve into a selection handle via a bounded metadata search (newest-first).
  // Recency-only sends NO filters key; a date source adds ISO takenAfter/Before.
  const filters = dateRange
    ? { takenAfter: dateRange.takenAfter.toISOString(), takenBefore: dateRange.takenBefore.toISOString() }
    : undefined;
  const handleResult = await client.call(
    'searchAssets',
    {
      mode: 'metadata',
      order: 'desc',
      limit: recencyLimit ?? MAX_RECENCY_LIMIT,
      ...(filters ? { filters } : {}),
      detail: 'handle',
    },
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
