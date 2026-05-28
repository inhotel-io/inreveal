const unsupported = Object.freeze({ kind: 'unsupported' });

const creationPhrasePattern = /\b(?:create|make|put together)\b/i;
const recentTripPattern = /\brecent\s+trip\b/i;
const albumPattern = /\balbum\b/i;
const highlightPattern = /\b(?:top|best|highlights?|favorite|pick|choose)\b/i;
const nonGenericPattern =
  /\b(?:add|invite|shared\s+space|set\s+the\s+description|set\s+description|metadata|rotate|archive|tag)\b/i;
const questionOnlyPattern = /^\s*(?:how many|what|which|when|where|who|why|can you tell me)\b/i;
const explicitAlbumNamePattern = /\b(?:called|named|as)\s+(?:"([^"]+)"|'([^']+)'|(.+?))\s*[.?!]?$/i;
const placePhrasePattern = /\brecent\s+trip\s+(?:to|in)\s+(.+?)\s*(?:\b(?:called|named|as)\b|[?!]|$)/i;
const uncertainPlacePattern = /^(?:somewhere|somewhere nice|there|that place|the trip|my trip)$/i;

const cleanSlot = (value) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[.?!]+$/g, '')
    .replace(/^the\s+/i, '')
    .trim();

const cleanAlbumName = (value) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

const normalizePlaceHint = (value) => {
  const cleaned = cleanSlot(value);
  if (!cleaned || uncertainPlacePattern.test(cleaned)) {
    return undefined;
  }

  if (/^(?:USA|U\.S\.?|US|United States|the United States)$/i.test(cleaned)) {
    return 'USA';
  }

  return cleaned.length <= 80 ? cleaned : undefined;
};

const extractPlaceHint = (prompt) => {
  const match = prompt.match(placePhrasePattern);
  return match ? normalizePlaceHint(match[1]) : undefined;
};

const extractAlbumName = (prompt, placeHint) => {
  const explicit = prompt.match(explicitAlbumNamePattern);
  if (explicit) {
    return cleanAlbumName(explicit[1] ?? explicit[2] ?? explicit[3]);
  }

  return placeHint ? `${placeHint} Trip` : 'Recent Trip';
};

const stripExplicitAlbumNameClause = (prompt) => prompt.replace(explicitAlbumNamePattern, '');

export const matchStrictWorkflow = (prompt) => {
  const text = String(prompt ?? '').trim();
  if (!text) {
    return unsupported;
  }

  if (
    !creationPhrasePattern.test(text) ||
    !albumPattern.test(text) ||
    !recentTripPattern.test(text) ||
    highlightPattern.test(stripExplicitAlbumNameClause(text)) ||
    nonGenericPattern.test(text) ||
    questionOnlyPattern.test(text)
  ) {
    return unsupported;
  }

  const placeHint = extractPlaceHint(text);
  const albumName = extractAlbumName(text, placeHint);
  if (!albumName) {
    return unsupported;
  }

  return placeHint
    ? { kind: 'create_recent_trip_album', albumName, placeHint }
    : { kind: 'create_recent_trip_album', albumName };
};
