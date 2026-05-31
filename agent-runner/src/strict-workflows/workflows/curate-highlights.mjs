import { handoffOpen, needsInput } from '../protocol.mjs';

// curate_highlights (hybrid): "pick/choose/select/suggest/curate/find the best/top N
// highlights from <source> [and make an album [called X]]" OR
// "favorite the best photos from <source>" OR
// "add N highlights from <source> to <album>".
//
// The router owns match + parseSlots. run() is a handoffOpen placeholder;
// Slices 4-6 replace it with the full bounded curation plan.
//
// DOES NOT MATCH:
//   - subjective-visual phrasing (sharpest, crispest, best composition, …)
//   - plain album creation without best/top/highlights signal
//   - read-only browse: "show me my best photos" (no source clause)

const KIND = 'curate_highlights';

const DEFAULT_HIGHLIGHT_COUNT = 10; // conservative default for a bounded source
const MAX_HIGHLIGHT_COUNT = 1000;   // mirrors MAX_CURATE_SELECTION_TARGET_COUNT

// Whole-library / unbounded sources cannot be curated without a narrowing scope.
const UNBOUNDED_SOURCE_PATTERN =
  /\b(?:my\s+)?(?:whole\s+|entire\s+)?(?:library|collection|everything|all\s+(?:my\s+|of\s+my\s+)?photos|all\s+photos)\b/i;

const clean = (value) => (typeof value === 'string' ? value.trim() : '');
const cleanSource = (value) => clean(value).replace(/[.?!]+$/u, '').trim();

const stripQuotes = (t) => (t.length >= 2 && /^["'"']/.test(t) && /["'"']$/.test(t) ? t.slice(1, -1).trim() : t);
const cleanName = (value) => stripQuotes(clean(value).replace(/[.?!]+$/u, '').trim());

// Subjective-visual qualifier → decline (quality scoring is a non-goal).
const SUBJECTIVE_VISUAL_PATTERN =
  /\b(sharpest|clearest|crispest|best\s+(?:composed|composition|shot|exposed)|highest\s+quality|in\s+focus)\b/i;

// Spelled-out number map (one..twenty + common rounds).
const WORD_COUNTS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, fifty: 50, hundred: 100,
};

const WORD_COUNT_ALTERNATIVES = Object.keys(WORD_COUNTS).join('|');
// Matches either a digit string or a spelled-out count word.
const COUNT_ALTS = `(?:\\d+|${WORD_COUNT_ALTERNATIVES})`;

// Robust count coercion for run() guardrails.
// The LLM may emit count as a number, a digit string, or a spelled-out word.
const coerceCount = (raw) => {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw === 'number') return raw;               // may be 0/negative → validated below
  const n = Number(raw);
  if (Number.isFinite(n)) return n;                      // "15" → 15
  return WORD_COUNTS[String(raw).toLowerCase()] ?? Number.NaN; // "fifteen" → 15, junk → NaN
};

const parseCount = (raw) => {
  if (!raw) return undefined;
  const n = Number(raw);
  if (Number.isInteger(n) && n > 0) return n;
  const word = raw.toLowerCase();
  return WORD_COUNTS[word] ?? undefined;
};

// FAVORITE_PATTERN → action:'favorite'
// "favorite/favourite [the] [N] best|top|highlight(s) photos? from|in|of <source>"
const FAVORITE_PATTERN = new RegExp(
  `\\bfavou?rite\\s+(?:the\\s+)?(?:(?<count>${COUNT_ALTS})\\s+)?(?:best|top|highlights?)\\s+(?:photos?\\s+)?(?:from|in|of)\\s+(?<source>.+)$`,
  'i',
);

// ADD_PATTERN → action:'addToAlbum'
// "add [N] [best|top] highlights from|in|of <source> to <album>"
const ADD_PATTERN = new RegExp(
  `\\badd\\s+(?:(?<count>${COUNT_ALTS})\\s+)?(?:best\\s+|top\\s+)?highlights?\\s+(?:from|in|of)\\s+(?<source>.+?)\\s+to\\s+(?<album>.+)$`,
  'i',
);

// ALBUM_BEST_TOP_PATTERN → action:'album' for "best/top" quality words.
// Includes 'find' so "find the best photos in my library" matches at the
// router level (Slice 4 applies the unbounded-source guardrail).
// Supports both "the best N photos" and "N best photos" via count1/count2.
const ALBUM_BEST_TOP_PATTERN = new RegExp(
  `\\b(?:pick|choose|select|grab|curate|find|put\\s+together)\\s+(?:me\\s+)?(?:(?:an?|the)\\s+)?(?:(?<count1>${COUNT_ALTS})\\s+)?(?:best|top)\\s+(?:(?<count2>${COUNT_ALTS})\\s+)?(?:photos?\\s+)?(?:from|in|of)\\s+(?<source>.+?)(?:\\s+(?:and\\s+)?(?:make|create|put(?:\\s+(?:them|it))?\\s+in(?:to)?)\\s+(?:an?\\s+)?album(?:\\s+(?:called|named|titled)\\s+(?<name>.+))?)?$`,
  'i',
);

// ALBUM_HIGHLIGHTS_PATTERN → action:'album' for "highlights" keyword.
const ALBUM_HIGHLIGHTS_PATTERN = new RegExp(
  `\\b(?:pick|choose|select|grab|curate|put\\s+together)\\s+(?:me\\s+)?(?:(?:an?|the)\\s+)?(?:(?<count>${COUNT_ALTS})\\s+)?highlights?\\s+(?:photos?\\s+)?(?:from|in|of)\\s+(?<source>.+?)(?:\\s+(?:and\\s+)?(?:make|create|put(?:\\s+(?:them|it))?\\s+in(?:to)?)\\s+(?:an?\\s+)?album(?:\\s+(?:called|named|titled)\\s+(?<name>.+))?)?$`,
  'i',
);

// SUGGEST_PATTERN → action:'album'
// "suggest [N] highlights from|in|of <source>"
const SUGGEST_PATTERN = new RegExp(
  `\\bsuggest\\s+(?:(?<count>${COUNT_ALTS})\\s+)?highlights?\\s+(?:from|in|of)\\s+(?<source>.+)$`,
  'i',
);

export const curateHighlightsWorkflow = () => ({
  kind: KIND,
  flow: 'hybrid',

  match(prompt) {
    const text = clean(prompt);
    if (!text) return undefined;

    // Bail on subjective-visual phrasing before any regex.
    if (SUBJECTIVE_VISUAL_PATTERN.test(text)) return undefined;

    // FAVORITE_PATTERN first so "favourite the best…" doesn't fall to album.
    const favM = FAVORITE_PATTERN.exec(text);
    if (favM?.groups?.source) {
      const sourceDescription = cleanSource(favM.groups.source);
      if (!sourceDescription) return undefined;
      const count = parseCount(favM.groups.count);
      return { slots: { action: 'favorite', sourceDescription, ...(count !== undefined ? { count } : {}) } };
    }

    // ADD_PATTERN: "add N highlights from <source> to <album>"
    const addM = ADD_PATTERN.exec(text);
    if (addM?.groups?.source && addM.groups.album) {
      const sourceDescription = cleanSource(addM.groups.source);
      const targetAlbum = cleanName(addM.groups.album);
      if (!sourceDescription || !targetAlbum) return undefined;
      const count = parseCount(addM.groups.count);
      return {
        slots: {
          action: 'addToAlbum',
          sourceDescription,
          targetAlbum,
          ...(count !== undefined ? { count } : {}),
        },
      };
    }

    // ALBUM_BEST_TOP_PATTERN: pick/choose/select/grab/curate/find … best/top
    const albBestM = ALBUM_BEST_TOP_PATTERN.exec(text);
    if (albBestM?.groups?.source) {
      const sourceDescription = cleanSource(albBestM.groups.source);
      if (!sourceDescription) return undefined;
      const count = parseCount(albBestM.groups.count1 ?? albBestM.groups.count2);
      const albumName = cleanName(albBestM.groups.name);
      return {
        slots: {
          action: 'album',
          sourceDescription,
          ...(count !== undefined ? { count } : {}),
          ...(albumName ? { albumName } : {}),
        },
      };
    }

    // ALBUM_HIGHLIGHTS_PATTERN: pick/choose/select/grab/curate … highlights
    const albHlM = ALBUM_HIGHLIGHTS_PATTERN.exec(text);
    if (albHlM?.groups?.source) {
      const sourceDescription = cleanSource(albHlM.groups.source);
      if (!sourceDescription) return undefined;
      const count = parseCount(albHlM.groups.count);
      const albumName = cleanName(albHlM.groups.name);
      return {
        slots: {
          action: 'album',
          sourceDescription,
          ...(count !== undefined ? { count } : {}),
          ...(albumName ? { albumName } : {}),
        },
      };
    }

    // SUGGEST_PATTERN: suggest N highlights from <source>
    const sugM = SUGGEST_PATTERN.exec(text);
    if (sugM?.groups?.source) {
      const sourceDescription = cleanSource(sugM.groups.source);
      if (!sourceDescription) return undefined;
      const count = parseCount(sugM.groups.count);
      return {
        slots: {
          action: 'album',
          sourceDescription,
          ...(count !== undefined ? { count } : {}),
        },
      };
    }

    return undefined;
  },

  parseSlots(rawSlots) {
    const sourceDescription = cleanSource(rawSlots?.sourceDescription);
    if (!sourceDescription) return null;
    const action = rawSlots?.action ?? 'album';
    const count = rawSlots?.count !== undefined ? rawSlots.count : undefined;
    const albumName = cleanName(rawSlots?.albumName);
    const targetAlbum = cleanName(rawSlots?.targetAlbum);
    return {
      action,
      sourceDescription,
      ...(count !== undefined ? { count } : {}),
      ...(albumName ? { albumName } : {}),
      ...(targetAlbum ? { targetAlbum } : {}),
    };
  },

  async run({ slots }) {
    const sourceDescription = clean(slots?.sourceDescription);
    if (!sourceDescription || UNBOUNDED_SOURCE_PATTERN.test(sourceDescription)) {
      return needsInput({
        text: 'To suggest highlights, I need a bounded source such as an album, shared space, date range, or selected photos. Which source or set should I use?',
      });
    }

    const count = coerceCount(slots?.count);
    if (count !== undefined && (Number.isNaN(count) || !Number.isInteger(count) || count < 1)) {
      return needsInput({ text: 'How many highlights would you like? Please give a positive whole number.' });
    }
    if (count !== undefined && count > MAX_HIGHLIGHT_COUNT) {
      return needsInput({
        text: `I can suggest ${MAX_HIGHLIGHT_COUNT} or fewer highlights at once. Pick a smaller number or narrow the source.`,
      });
    }
    const targetCount = count ?? DEFAULT_HIGHLIGHT_COUNT;

    // Slice 5 replaces this with: resolve source → curateSelection(targetCount) → propose.
    void targetCount;
    return handoffOpen({ reason: 'Highlight curation planning is not implemented yet.' });
  },
});
