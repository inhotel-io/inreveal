import { SUBJECTIVE_PATTERN } from '../asset-source-resolver.mjs';

// archive_assets (hybrid): "archive/unarchive <source>" → a batch
// asset.setArchive over a resolved selection handle. This module is the router
// half (match + parseSlots); execution (run) and registry/manifest registration
// land in later slices. The source is resolved by the shared resolver, so only
// recency/date/type sources plan — subjective/qualified sources hand off.

const KIND = 'archive_assets';

const clean = (value) => (typeof value === 'string' ? value.trim() : '');
const cleanSource = (value) => clean(value).replace(/[.?!]+$/u, '').trim();

// Polarity from either a boolean (regex fast-path / JSON LLM slot) or a string.
const coerceArchived = (value) => {
  if (typeof value === 'boolean') {
    return value;
  }
  const text = clean(value).toLowerCase();
  if (['true', 'archive', 'archived', 'yes'].includes(text)) {
    return true;
  }
  if (['false', 'unarchive', 'unarchived', 'no'].includes(text)) {
    return false;
  }
  return undefined;
};

// Decline subjective and recent-trip sources at the fast-path so they flow to the
// LLM classifier / open orchestration rather than being coerced into a metadata
// archive here (the resolver would hand them off anyway).
const tripSourcePattern = /\brecent\s+trip\b/i;
const declinesSourceFastPath = (source) => SUBJECTIVE_PATTERN.test(source) || tripSourcePattern.test(source);

// `\barchive` has no word boundary inside "unarchive" (n→a), so ARCHIVE never
// matches an unarchive prompt; UNARCHIVE/MOVE_OUT are still tried first. ARCHIVE
// requires `\s+<source>` after "archive", so "... out of archive" is not caught.
const UNARCHIVE_PATTERN = /\bun-?archive\s+(?<source>.+)$/i;
const MOVE_OUT_PATTERN =
  /\b(?:move|take|pull|get|remove|restore)\s+(?<source>.+?)\s+(?:out\s+of|from)\s+(?:the\s+)?archive\b/i;
const ARCHIVE_PATTERN = /\barchive\s+(?<source>.+)$/i;

const POLARITY_PATTERNS = [
  [UNARCHIVE_PATTERN, false],
  [MOVE_OUT_PATTERN, false],
  [ARCHIVE_PATTERN, true],
];

export const archiveAssetsWorkflow = () => ({
  kind: KIND,
  flow: 'hybrid',

  match(prompt) {
    const text = clean(prompt);
    if (!text) {
      return undefined;
    }
    for (const [pattern, archived] of POLARITY_PATTERNS) {
      const m = pattern.exec(text);
      if (m?.groups?.source) {
        const sourceDescription = cleanSource(m.groups.source);
        if (!sourceDescription || declinesSourceFastPath(sourceDescription)) {
          return undefined;
        }
        return { slots: { archived, sourceDescription } };
      }
    }
    return undefined;
  },

  parseSlots(rawSlots) {
    const sourceDescription = cleanSource(rawSlots?.sourceDescription);
    if (!sourceDescription) {
      return null;
    }
    // Default to archive when polarity is omitted (the workflow's primary action).
    const archived = coerceArchived(rawSlots?.archived) ?? true;
    return { archived, sourceDescription };
  },
});
