// rename_or_describe_space (strict): mirror of rename_or_describe_album for shared
// spaces. The router is GATED on the `space` keyword so it never steals album or
// generic "rename X to Y" phrasings (the album-vs-space disambiguation). Execution
// (run) and registration land in later slices; registering this BEFORE
// rename_or_describe_album (Slice 19) lets the strict gate win the regex fast-path.

const KIND = 'rename_or_describe_space';

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

// Strip a leading article, a leading "shared space " wrapper, and a trailing
// " [shared] space" noun so "the Family space" / "shared space Family" → "Family".
const normalizeSpaceRef = (value) =>
  clean(value)
    .replace(/^(?:the|my|this|that|our)\s+/i, '')
    .replace(/^shared\s+space\s+/i, '')
    .replace(/\s+(?:shared\s+)?space$/i, '')
    .trim();

// Regex gate: only treat a reference as a space when it actually says "space".
const mentionsSpace = (ref) => /\bspace\b/i.test(clean(ref));

const RENAME_PATTERN =
  /\b(?:rename|re-?name)\s+(?<spaceRef>.+?)\s+to\s+(?<newName>.+?)(?:\s+and\s+(?:add|set|give\s+it)\s+(?:a\s+)?description.*)?$/i;
const DESCRIBE_PATTERN =
  /\b(?:change|set|update|add|edit)\s+(?:the\s+|a\s+|its\s+)?description\s+(?:on|of|for)\s+(?<spaceRef>.+?)(?:\s+to\s+(?<description>.+))?$/i;

const stripTrailingPunct = (value) => clean(value).replace(/[.?!]+$/u, '').trim();

export const renameOrDescribeSpaceWorkflow = () => ({
  kind: KIND,
  flow: 'strict',

  match(prompt) {
    const text = clean(prompt);
    if (!text) {
      return undefined;
    }

    const rename = RENAME_PATTERN.exec(text);
    if (rename?.groups && mentionsSpace(rename.groups.spaceRef)) {
      const spaceRef = normalizeSpaceRef(rename.groups.spaceRef);
      const newName = stripTrailingPunct(rename.groups.newName);
      if (spaceRef && newName) {
        return { slots: { spaceRef, newName } };
      }
    }

    const describe = DESCRIBE_PATTERN.exec(text);
    if (describe?.groups && mentionsSpace(describe.groups.spaceRef)) {
      const spaceRef = normalizeSpaceRef(describe.groups.spaceRef);
      const description = stripTrailingPunct(describe.groups.description);
      if (spaceRef) {
        return { slots: description ? { spaceRef, description } : { spaceRef } };
      }
    }

    return undefined;
  },

  // The classifier has already chosen this workflow, so parseSlots does NOT
  // re-apply the `space`-keyword gate — it only normalizes and validates.
  parseSlots(rawSlots) {
    const spaceRef = normalizeSpaceRef(rawSlots?.spaceRef);
    const newName = clean(rawSlots?.newName);
    const description = clean(rawSlots?.description);
    if (!spaceRef) {
      return null;
    }
    if (!newName && !description) {
      return null;
    }
    const slots = { spaceRef };
    if (newName) {
      slots.newName = newName;
    }
    if (description) {
      slots.description = description;
    }
    return slots;
  },
});
