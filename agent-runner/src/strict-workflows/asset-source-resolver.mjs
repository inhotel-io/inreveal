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

// --- named-entity / direct-metadata source detection (Phase 0) ---------------

// Camera makes recognized in the bare "my <Make> photos" form. An allow-list so a
// place ("my Berlin photos") is NOT mistaken for a camera. Explicit "shot on/with
// <X>" captures any make regardless of this list.
const CAMERA_MAKES = new Set([
  'sony', 'canon', 'nikon', 'fuji', 'fujifilm', 'leica', 'panasonic', 'olympus',
  'pentax', 'gopro', 'dji', 'hasselblad', 'ricoh', 'sigma', 'kodak',
]);

// Capitalized words that are filler, never a place/camera even before a photo noun.
const NON_ENTITY_WORDS = new Set([
  'my', 'the', 'a', 'an', 'these', 'those', 'all', 'some', 'our',
  'recent', 'newest', 'latest', 'last', 'most', 'best', 'good',
]);

// Caps to keep the later resolveAssetSearchFilters strictObject within bounds.
const MAX_ENTITY_NAMES_PER_KIND = 20;
const MAX_ENTITY_NAME_LENGTH = 120;

const PHOTO_NOUN = '(?:photos?|pics?|pictures?|snaps?|shots?)';

// --- media type parsing (pure) ----------------------------------------------

// Explicit type words only. The generic colloquial library words
// (photos/pics/pictures/snaps/shots) are NOT types — "my photos" means the whole
// library (incl. videos), so they stay filler (see GENERIC_NOUNS). A media type is
// a modifier on a recency/date source, never a bound on its own (a type-only
// source like "my videos" is unbounded → handoff via the unbounded gate below).
const VIDEO_TYPE_RE = /\b(?:videos?|clips?|movies?)\b/i;
const IMAGE_TYPE_RE = /\b(?:images?)\b/i;

export const parseMediaType = (source) => {
  const text = String(source ?? '');
  if (VIDEO_TYPE_RE.test(text)) {
    return 'VIDEO';
  }
  if (IMAGE_TYPE_RE.test(text)) {
    return 'IMAGE';
  }
  return undefined;
};

// Classify which named-entity / direct-metadata classes a source mentions. Pure;
// proposes candidate name strings (the server/tool layer decides matched/ambiguous/
// not_found in Slice 2). Returns undefined when the source has no entity (recency /
// date / type / filler only). Operates on a mutable working copy, consuming each
// matched span so later rules don't re-match it (and so multiple kinds accumulate).
export const parseEntitySource = (source) => {
  let text = ` ${String(source ?? '')} `;
  const result = {};
  const pushName = (key, raw) => {
    const name = clean(raw);
    if (!name || name.length > MAX_ENTITY_NAME_LENGTH) {
      return;
    }
    const list = (result[key] ??= []);
    if (list.length < MAX_ENTITY_NAMES_PER_KIND && !list.includes(name)) {
      list.push(name);
    }
  };
  const setDirect = (key, value) => {
    (result.directFilters ??= {})[key] = value;
  };

  // (1) album: "in the <Album> album" — before place "in <X>".
  text = text.replace(/\bin\s+the\s+([A-Za-z][\w' -]*?)\s+albums?\b/gi, (_m, n) => (pushName('albums', n), ' '));
  // (2) tag: "<Tag>-tagged" first (so the hyphenated form is consumed before "tagged <Tag>" sees it),
  // then "tagged <Tag>".
  text = text.replace(/\b([A-Za-z][\w']*)-tagged\b/gi, (_m, n) => (pushName('tags', n), ' '));
  text = text.replace(/\btagged\s+([A-Za-z][\w'-]*)/gi, (_m, n) => (pushName('tags', n), ' '));
  // (3) camera (explicit): "shot on/with <Make>" — any token, consumed before people "with".
  text = text.replace(/\bshot\s+(?:on|with)\s+([A-Za-z][\w'-]*)/gi, (_m, n) => (pushName('cameras', n), ' '));
  // (4) people: "of/with <Capitalized Name>".
  text = text.replace(/\b(?:of|with)\s+([A-Z][A-Za-z'-]*(?:\s+[A-Z][A-Za-z'-]*)*)/g, (_m, n) => (pushName('people', n), ' '));
  // (5) rating: "rated N" / "N-star(s)" / "N stars" (clamp 1..5; out-of-range left in place).
  text = text.replace(/\brated\s+([1-9]\d?)\b/gi, (m, n) => (Number(n) <= 5 ? (setDirect('rating', Number(n)), ' ') : m));
  text = text.replace(/\b([1-9]\d?)[\s-]?stars?\b/gi, (m, n) => (Number(n) <= 5 ? (setDirect('rating', Number(n)), ' ') : m));
  // (6) favorites.
  if (/\bfavou?rites?\b/i.test(text)) {
    setDirect('isFavorite', true);
    text = text.replace(/\bfavou?rites?\b/gi, ' ');
  }
  // (7) visibility.
  if (/\barchived\b/i.test(text)) {
    setDirect('visibility', 'archive');
    text = text.replace(/\barchived\b/gi, ' ');
  }
  // (8) camera (bare): "my <Make> photos" where Make is a known make.
  const bareNoun = new RegExp(`\\b([A-Z][A-Za-z]+)\\b(?=\\s+${PHOTO_NOUN}\\b)`, 'g');
  text = text.replace(bareNoun, (m, n) =>
    CAMERA_MAKES.has(n.toLowerCase()) ? (pushName('cameras', n), ' ') : m,
  );
  // (9a) place: "my <Place> photos" (capitalized, not filler, not a known make).
  text = text.replace(new RegExp(`\\b([A-Z][A-Za-z]+)\\b(?=\\s+${PHOTO_NOUN}\\b)`, 'g'), (m, n) =>
    NON_ENTITY_WORDS.has(n.toLowerCase()) ? m : (setDirect('city', n), ' '),
  );
  // (9b) place: "from/in <Place>" (capitalized, not followed by "album", first wins).
  text = text.replace(/\b(?:from|in)\s+([A-Z][A-Za-z'-]*)\b(?!\s+albums?\b)/g, (m, n) => {
    if (NON_ENTITY_WORDS.has(n.toLowerCase())) {
      return m;
    }
    if (result.directFilters?.city === undefined) {
      setDirect('city', n);
    }
    return ' ';
  });

  return Object.keys(result).length > 0 ? result : undefined;
};

// --- clean-source gate ------------------------------------------------------

// Generic media nouns are filler (a recency/date source can carry them).
const GENERIC_NOUNS = /\b(?:photos?|pics?|pictures?|snaps?|shots?)\b/gi;
// Explicit type nouns are consumed by the gate too (they map to a `type` filter
// via parseMediaType), so a type-qualified source is "clean".
const TYPE_NOUNS = /\b(?:videos?|clips?|movies?|images?)\b/gi;
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

// Entity connector/keyword tokens consumed alongside recognized entity names so an
// entity source reads as "clean".
const ENTITY_KEYWORD_STRIP = /\b(?:tagged|shot\s+(?:on|with)|rated|stars?|favou?rites?|archived|albums?)\b/gi;

// A source is "clean" when, after removing recency / date / generic-noun / filler AND
// recognized entity tokens, nothing substantive remains. Subjective qualifiers
// ("best") are NOT entity tokens, so they survive and keep the source un-clean.
export const isCleanSource = (source) => {
  let text = String(source ?? '').toLowerCase();
  const entity = parseEntitySource(source);
  if (entity) {
    const names = [
      ...(entity.people ?? []),
      ...(entity.tags ?? []),
      ...(entity.albums ?? []),
      ...(entity.cameras ?? []),
      ...(entity.directFilters?.city ? [entity.directFilters.city] : []),
    ];
    for (const name of names) {
      text = text.split(name.toLowerCase()).join(' ');
    }
    text = text.replace(ENTITY_KEYWORD_STRIP, ' ');
  }
  const residual = text
    .replace(DATE_STRIP, ' ')
    .replace(RECENCY_PATTERN_G, ' ')
    .replace(/\b\d{1,4}\b/g, ' ')
    .replace(GENERIC_NOUNS, ' ')
    .replace(TYPE_NOUNS, ' ')
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

  // Phase 0 (Slice 1): named-entity / direct-metadata sources are DETECTED here, but
  // the resolution path (resolveAssetSearchFilters → searchAssets with entity filters)
  // lands in Slice 2. Until then an entity source hands off rather than over-resolve by
  // the recency/date part alone.
  if (parseEntitySource(source)) {
    return { status: 'handoff', reason: `Source "${source}" names an entity this workflow resolves in a later step.` };
  }

  const recencyLimit = parseRecencyLimit(source);
  const dateRange = parseDateRange(source, now);
  const mediaType = parseMediaType(source);

  // Clean-source gate: an unresolvable qualifier (place/name/tag) hands off
  // rather than over-resolve by the recognized recency/date/type part alone.
  if (!isCleanSource(source)) {
    return {
      status: 'handoff',
      reason: `Source "${source}" includes terms this workflow cannot resolve from metadata alone.`,
    };
  }
  // Clean but unbounded (no count and no date) — nothing to bound a search by.
  // Media type is a modifier, not a bound, so a type-only source hands off here.
  if (recencyLimit === undefined && dateRange === undefined) {
    return { status: 'handoff', reason: `Source "${source}" needs a count or date range this workflow can bound.` };
  }

  // Resolve into a selection handle via a bounded metadata search (newest-first).
  // Recency-only sends NO filters key; date/type sources add ISO takenAfter/Before
  // and/or a `type` filter (AssetType enum: IMAGE/VIDEO).
  const filters = {
    ...(dateRange
      ? { takenAfter: dateRange.takenAfter.toISOString(), takenBefore: dateRange.takenBefore.toISOString() }
      : {}),
    ...(mediaType ? { type: mediaType } : {}),
  };
  const hasFilters = Object.keys(filters).length > 0;
  const handleResult = await client.call(
    'searchAssets',
    {
      mode: 'metadata',
      order: 'desc',
      limit: recencyLimit ?? MAX_RECENCY_LIMIT,
      ...(hasFilters ? { filters } : {}),
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
