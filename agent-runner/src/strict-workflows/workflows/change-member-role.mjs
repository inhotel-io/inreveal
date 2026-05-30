// change_member_role (strict): "make <user> an editor/viewer in <space>" /
// "change <user>'s role to <role> in <space>". The role word is the gate, so a
// non-role "make X … in Y" never matches. Execution + registration land in later
// slices. This module is the router half.

const KIND = 'change_member_role';

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

const normalizeSpaceRef = (value) =>
  clean(value)
    .replace(/^(?:the|my|this|that|our)\s+/i, '')
    .replace(/^shared\s+space\s+/i, '')
    .replace(/\s+(?:shared\s+)?space$/i, '')
    .trim();

const ROLE_SYNONYMS = {
  editor: 'editor',
  edit: 'editor',
  contributor: 'editor',
  viewer: 'viewer',
  view: 'viewer',
  reader: 'viewer',
  'read-only': 'viewer',
  owner: 'owner',
  admin: 'owner',
  manager: 'owner',
};
const normalizeRole = (word) => ROLE_SYNONYMS[clean(word).toLowerCase()];

// Longer synonyms first so e.g. "editor" wins over "edit".
const ROLE_ALT = 'editor|contributor|edit|viewer|reader|read-only|view|owner|admin|manager';

const MAKE_PATTERN = new RegExp(
  `\\bmake\\s+(?<member>.+?)\\s+(?:an?\\s+|the\\s+)?(?<role>${ROLE_ALT})\\s+(?:in|of|on|for)\\s+(?<space>.+)$`,
  'i',
);
const CHANGE_ROLE_PATTERN = new RegExp(
  `\\b(?:change|set|update)\\s+(?<member>.+?)(?:'s|s')?\\s+role\\s+to\\s+(?:an?\\s+|the\\s+)?(?<role>${ROLE_ALT})\\s+(?:in|of|on|for)\\s+(?<space>.+)$`,
  'i',
);
const CHANGE_TO_PATTERN = new RegExp(
  `\\b(?:change|set|update|make)\\s+(?<member>.+?)\\s+(?:in)?to\\s+(?:an?\\s+|the\\s+)?(?<role>${ROLE_ALT})\\s+(?:in|of|on|for)\\s+(?<space>.+)$`,
  'i',
);

const PATTERNS = [MAKE_PATTERN, CHANGE_ROLE_PATTERN, CHANGE_TO_PATTERN];

export const changeMemberRoleWorkflow = () => ({
  kind: KIND,
  flow: 'strict',

  match(prompt) {
    const text = clean(prompt);
    if (!text) {
      return undefined;
    }
    for (const pattern of PATTERNS) {
      const m = pattern.exec(text);
      if (!m?.groups) {
        continue;
      }
      const role = normalizeRole(m.groups.role);
      const memberQuery = clean(m.groups.member);
      const spaceRef = normalizeSpaceRef(m.groups.space);
      if (role && memberQuery && spaceRef) {
        return { slots: { memberQuery, role, spaceRef } };
      }
    }
    return undefined;
  },

  parseSlots(rawSlots) {
    const memberQuery = clean(rawSlots?.memberQuery);
    const role = normalizeRole(rawSlots?.role);
    const spaceRef = normalizeSpaceRef(rawSlots?.spaceRef);
    if (!memberQuery || !role || !spaceRef) {
      return null;
    }
    return { memberQuery, role, spaceRef };
  },
});
