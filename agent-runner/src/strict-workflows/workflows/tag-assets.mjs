import { SUBJECTIVE_PATTERN } from '../asset-source-resolver.mjs';

// tag_assets (hybrid, ADD-ONLY): "tag <source> as <tag>" / "add [the] tag <tag>
// to <source>" → a batch asset.addTag over a resolved selection handle. The batch
// action union has no removeTag, so removal phrasings hand off (no match here).
// This module is the router half; execution + registration land in later slices.

const KIND = 'tag_assets';

const clean = (value) => (typeof value === 'string' ? value.trim() : '');
const cleanSource = (value) => clean(value).replace(/[.?!]+$/u, '').trim();

// Strip a single pair of surrounding quotes (straight or smart) from a tag name.
const stripQuotes = (t) => (t.length >= 2 && /^["'“‘]/.test(t) && /["'”’]$/.test(t) ? t.slice(1, -1).trim() : t);
const cleanTag = (value) => stripQuotes(clean(value).replace(/[.?!]+$/u, '').trim());

const tripSourcePattern = /\brecent\s+trip\b/i;
const declinesSourceFastPath = (source) => SUBJECTIVE_PATTERN.test(source) || tripSourcePattern.test(source);

// `\btag` has no boundary inside "untag" (n→t), so an untag prompt never matches
// TAG_AS; "remove the X tag from …" matches none of the add-patterns.
const TAG_AS_PATTERN = /\btag\s+(?<source>.+?)\s+as\s+(?<tag>.+)$/i;
const ADD_TAG_NAMED_TO_PATTERN = /\badd\s+(?:the\s+)?tag\s+(?<tag>.+?)\s+to\s+(?<source>.+)$/i;
const ADD_NAMED_TAG_TO_PATTERN = /\badd\s+(?:the\s+)?(?<tag>.+?)\s+tag\s+to\s+(?<source>.+)$/i;

const PATTERNS = [TAG_AS_PATTERN, ADD_TAG_NAMED_TO_PATTERN, ADD_NAMED_TAG_TO_PATTERN];

export const tagAssetsWorkflow = () => ({
  kind: KIND,
  flow: 'hybrid',

  match(prompt) {
    const text = clean(prompt);
    if (!text) {
      return undefined;
    }
    for (const pattern of PATTERNS) {
      const m = pattern.exec(text);
      if (m?.groups?.source && m.groups.tag) {
        const sourceDescription = cleanSource(m.groups.source);
        const tagName = cleanTag(m.groups.tag);
        if (!sourceDescription || !tagName || declinesSourceFastPath(sourceDescription)) {
          return undefined;
        }
        return { slots: { sourceDescription, tagName } };
      }
    }
    return undefined;
  },

  parseSlots(rawSlots) {
    const sourceDescription = cleanSource(rawSlots?.sourceDescription);
    const tagName = cleanTag(rawSlots?.tagName);
    if (!sourceDescription || !tagName) {
      return null;
    }
    return { sourceDescription, tagName };
  },
});
