// manage_space_members (strict): "add <users> to <space> [as <role>]" /
// "remove <users> from <space>". The router is GATED so it never steals a photo
// add ("add <photos> to <album>") or a tag add — an add only matches when it
// mentions a "space" or carries an explicit role. Execution + registration land
// in later slices. This module is the router half.

const KIND = 'manage_space_members';

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

const normalizeSpaceRef = (value) =>
  clean(value)
    .replace(/^(?:the|my|this|that|our)\s+/i, '')
    .replace(/^shared\s+space\s+/i, '')
    .replace(/\s+(?:shared\s+)?space$/i, '')
    .trim();

const mentionsSpace = (ref) => /\bspace\b/i.test(clean(ref));

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

// A trailing "as [a/an] <role>".
const ROLE_SUFFIX = /\s+as\s+(?:an?\s+)?([a-z][a-z-]*)\s*[.?!]*$/i;

const splitMembers = (text) =>
  clean(text)
    .split(/\s*,\s*|\s+and\s+|\s*&\s*/i)
    .map((part) => clean(part).replace(/^the\s+/i, '').trim())
    .filter(Boolean);

const normalizeMemberQueries = (value) => {
  if (Array.isArray(value)) {
    return value.map((member) => clean(member)).filter(Boolean);
  }
  return splitMembers(value);
};

const ADD_PATTERN = /\badd\s+(?<members>.+?)\s+to\s+(?<rest>.+)$/i;
const REMOVE_PATTERN = /\bremove\s+(?<members>.+?)\s+from\s+(?<rest>.+)$/i;

export const manageSpaceMembersWorkflow = () => ({
  kind: KIND,
  flow: 'strict',

  match(prompt) {
    const text = clean(prompt);
    if (!text) {
      return undefined;
    }

    const add = ADD_PATTERN.exec(text);
    if (add?.groups) {
      let rest = add.groups.rest;
      let role;
      const roleMatch = ROLE_SUFFIX.exec(rest);
      if (roleMatch) {
        const normalized = normalizeRole(roleMatch[1]);
        if (normalized) {
          role = normalized;
          rest = rest.slice(0, roleMatch.index);
        }
      }
      const spaceRef = normalizeSpaceRef(rest);
      const memberQueries = splitMembers(add.groups.members);
      // Gate: a space membership op mentions a "space" OR carries an explicit role,
      // so "add <photos> to <album>" / "add the tag … to …" fall through.
      if ((mentionsSpace(rest) || role) && spaceRef && memberQueries.length) {
        return { slots: { action: 'add', memberQueries, spaceRef, ...(role ? { role } : {}) } };
      }
    }

    const remove = REMOVE_PATTERN.exec(text);
    if (remove?.groups) {
      const rest = remove.groups.rest;
      const spaceRef = normalizeSpaceRef(rest);
      const memberQueries = splitMembers(remove.groups.members);
      if (mentionsSpace(rest) && spaceRef && memberQueries.length) {
        return { slots: { action: 'remove', memberQueries, spaceRef } };
      }
    }

    return undefined;
  },

  parseSlots(rawSlots) {
    const action = clean(rawSlots?.action).toLowerCase();
    if (action !== 'add' && action !== 'remove') {
      return null;
    }
    const spaceRef = normalizeSpaceRef(rawSlots?.spaceRef);
    if (!spaceRef) {
      return null;
    }
    const memberQueries = normalizeMemberQueries(rawSlots?.memberQueries);
    if (!memberQueries.length) {
      return null;
    }
    const slots = { action, spaceRef, memberQueries };
    if (action === 'add') {
      // Default to the least-privileged role when none is given.
      slots.role = normalizeRole(rawSlots?.role) ?? 'viewer';
    }
    return slots;
  },
});
