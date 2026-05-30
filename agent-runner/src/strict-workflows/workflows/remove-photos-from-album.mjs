import { SUBJECTIVE_PATTERN } from '../asset-source-resolver.mjs';
import { handoffOpen } from '../protocol.mjs';

const KIND = 'remove_photos_from_album';

const clean = (value) => (typeof value === 'string' ? value.trim() : '');
const cleanSource = (value) => clean(value).replace(/[.?!]+$/u, '').trim();

// Strip a leading article and a trailing "album" noun so "the Family album" → "Family".
const normalizeAlbumRef = (value) =>
  clean(value)
    .replace(/^(?:the|my|this|that)\s+/i, '')
    .replace(/\s+album$/i, '')
    .trim();

const tripSourcePattern = /\brecent\s+trip\b/i;

// "remove <source> from <album>" / "remove <source> out of <album>" /
// "take <source> out of <album>". Greedy source binds the FINAL from/out-of.
const REMOVE_FROM = /\b(?:remove|delete|drop)\s+(?<source>.+)\s+(?:from|out\s+of)\s+(?<album>.+?)$/i;
const TAKE_OUT_OF = /\btake\s+(?<source>.+)\s+out\s+of\s+(?<album>.+?)$/i;

// "remove … from …" is shared by member removal, out-of-favorites, and tag removal.
// Decline those so registry order + this gate keep the seam clean even in isolation.
const albumIsOwnedElsewhere = (album) => /\bspaces?\b/i.test(album) || /\bfavou?rites?\b/i.test(album);
const sourceIsOwnedElsewhere = (source) =>
  SUBJECTIVE_PATTERN.test(source) || tripSourcePattern.test(source) || /\btags?\b/i.test(source);

const tryMatch = (prompt) => {
  const match = REMOVE_FROM.exec(prompt) ?? TAKE_OUT_OF.exec(prompt);
  if (!match?.groups) {
    return undefined;
  }
  const sourceDescription = cleanSource(match.groups.source);
  const albumRaw = clean(match.groups.album);
  if (!sourceDescription || !albumRaw) {
    return undefined;
  }
  if (albumIsOwnedElsewhere(albumRaw) || sourceIsOwnedElsewhere(sourceDescription)) {
    return undefined;
  }
  const albumRef = normalizeAlbumRef(albumRaw);
  return albumRef ? { albumRef, sourceDescription } : undefined;
};

export const removePhotosFromAlbumWorkflow = () => ({
  kind: KIND,
  flow: 'hybrid',

  match(prompt) {
    const text = clean(prompt);
    if (!text) {
      return undefined;
    }
    const matched = tryMatch(text);
    return matched ? { slots: matched } : undefined;
  },

  parseSlots(rawSlots) {
    const albumRef = normalizeAlbumRef(rawSlots?.albumRef);
    const sourceDescription = cleanSource(rawSlots?.sourceDescription);
    if (!albumRef || !sourceDescription) {
      return null;
    }
    return { albumRef, sourceDescription };
  },

  // Execution lands in Slice 11.
  async run() {
    return handoffOpen({ reason: 'remove_photos_from_album execution is implemented in Slice 11.' });
  },
});
