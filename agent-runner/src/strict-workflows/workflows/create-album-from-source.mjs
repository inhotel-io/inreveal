import { SUBJECTIVE_PATTERN } from '../asset-source-resolver.mjs';

// create_album_from_source (hybrid): "make/create an album of/from <source>
// [called <name>]" — the generic album-create the trip workflow does not cover.
// Declines a "recent trip" source (owned by create_recent_trip_album) and a
// subjective source; "add … to <album>" never matches (no make-album verb). This
// module is the router half; execution + registration land in later slices.

const KIND = 'create_album_from_source';
const DEFAULT_NAME = 'New Album';

const clean = (value) => (typeof value === 'string' ? value.trim() : '');
const cleanSource = (value) => clean(value).replace(/[.?!]+$/u, '').trim();

const stripQuotes = (t) => (t.length >= 2 && /^["'“‘]/.test(t) && /["'”’]$/.test(t) ? t.slice(1, -1).trim() : t);
const cleanName = (value) => stripQuotes(clean(value).replace(/[.?!]+$/u, '').trim());

const tripSourcePattern = /\brecent\s+trip\b/i;
const declinesSource = (source) => SUBJECTIVE_PATTERN.test(source) || tripSourcePattern.test(source);

const CREATE_PATTERN =
  /\b(?:make|create|build|put\s+together|assemble|generate)\s+(?:me\s+)?(?:an?\s+|a\s+new\s+|another\s+)?album\s+(?:of|from|out\s+of|with|containing|for)\s+(?<source>.+?)(?:\s+(?:called|named|titled|with\s+the\s+(?:name|title))\s+(?<name>.+))?$/i;

export const createAlbumFromSourceWorkflow = () => ({
  kind: KIND,
  flow: 'hybrid',

  match(prompt) {
    const text = clean(prompt);
    if (!text) {
      return undefined;
    }
    const m = CREATE_PATTERN.exec(text);
    if (!m?.groups) {
      return undefined;
    }
    const sourceDescription = cleanSource(m.groups.source);
    if (!sourceDescription || declinesSource(sourceDescription)) {
      return undefined;
    }
    const albumName = cleanName(m.groups.name);
    return { slots: albumName ? { sourceDescription, albumName } : { sourceDescription } };
  },

  parseSlots(rawSlots) {
    const sourceDescription = cleanSource(rawSlots?.sourceDescription);
    if (!sourceDescription) {
      return null;
    }
    const albumName = cleanName(rawSlots?.albumName) || DEFAULT_NAME;
    return { sourceDescription, albumName };
  },
});
