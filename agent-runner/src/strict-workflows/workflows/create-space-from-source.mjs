import { SUBJECTIVE_PATTERN } from '../asset-source-resolver.mjs';
import { handoffOpen } from '../protocol.mjs';

const KIND = 'create_space_from_source';
const DEFAULT_NAME = 'New Space';

const clean = (value) => (typeof value === 'string' ? value.trim() : '');
const cleanSource = (value) => clean(value).replace(/[.?!]+$/u, '').trim();
const stripQuotes = (value) =>
  clean(value)
    .replace(/^["'""'']+/, '')
    .replace(/["'""'']+$/, '')
    .trim();

const declinesSource = (source) => SUBJECTIVE_PATTERN.test(source);

// An inline "name" that is really a filler adjective is NOT a name.
const FILLER_NAMES = new Set(['shared', 'new', 'a', 'an', 'the', 'my', 'this', 'that', 'our']);

const FORM_TRAILING_NAME =
  /\b(?:make|create|build)\s+(?:an?\s+)?(?:shared\s+)?space\s+(?:of|from|with|out\s+of)\s+(?<source>.+?)\s+(?:called|named|titled)\s+(?<name>.+)$/i;
const FORM_INLINE_NAME =
  /\b(?:make|create|build)\s+(?:an?\s+)?(?:shared\s+)?(?<name>.+?)\s+space\s+(?:of|from|with|out\s+of)\s+(?<source>.+)$/i;
const FORM_NO_NAME =
  /\b(?:make|create|build)\s+(?:an?\s+)?(?:shared\s+)?space\s+(?:of|from|with|out\s+of)\s+(?<source>.+)$/i;

const tryMatch = (prompt) => {
  let match = FORM_TRAILING_NAME.exec(prompt);
  let spaceName;
  if (match?.groups) {
    spaceName = match.groups.name;
  } else {
    match = FORM_INLINE_NAME.exec(prompt);
    if (match?.groups) {
      const candidate = clean(match.groups.name);
      spaceName = FILLER_NAMES.has(candidate.toLowerCase()) ? undefined : candidate;
    } else {
      match = FORM_NO_NAME.exec(prompt);
    }
  }
  if (!match?.groups) {
    return undefined;
  }
  const sourceDescription = cleanSource(match.groups.source);
  if (!sourceDescription || declinesSource(sourceDescription)) {
    return undefined;
  }
  const name = spaceName ? stripQuotes(spaceName) : '';
  return name ? { sourceDescription, spaceName: name } : { sourceDescription };
};

export const createSpaceFromSourceWorkflow = () => ({
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
    const sourceDescription = cleanSource(rawSlots?.sourceDescription);
    if (!sourceDescription) {
      return null;
    }
    const name = stripQuotes(rawSlots?.spaceName);
    return { sourceDescription, spaceName: name || DEFAULT_NAME };
  },

  // Execution lands in Slice 16.
  async run() {
    return handoffOpen({ reason: 'create_space_from_source execution is implemented in Slice 16.' });
  },
});
