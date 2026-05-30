import { failed, needsInput } from '../protocol.mjs';
import { gatePlanResult, safeFailureText } from './plan-gate.mjs';

// manage_space_members (strict): "add <users> to <space> [as <role>]" /
// "remove <users> from <space>". The router is GATED so it never steals a photo
// add ("add <photos> to <album>") or a tag add — an add only matches when it
// mentions a "space" or carries an explicit role.
//
// Safety guards (deterministic, from the readSpace member set):
//   - owner is NOT assignable on add (role editor/viewer only).
//   - already-a-member add is skipped (never re-add).
//   - removing a non-member asks for input (never a no-op).
//   - removing the space OWNER is blocked — the runner has no current-user
//     identity, so the owner is the deterministic proxy for "self"; this subsumes
//     self-removal and last-owner removal, and the server is the backstop
//     ("Pi cannot remove or demote the owner of a space").

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

  async run({ client, slots, signal }) {
    const action = clean(slots?.action).toLowerCase();
    const memberQueries = Array.isArray(slots?.memberQueries) ? slots.memberQueries : [];
    const role = clean(slots?.role).toLowerCase();

    // Owner is not assignable to a member.
    if (action === 'add' && role === 'owner') {
      return needsInput({
        text: 'I can add members as an editor or a viewer, not an owner. Which role should I use?',
      });
    }

    // 1. Resolve the space (none/ambiguous → ask).
    const ref = normalizeSpaceRef(slots?.spaceRef);
    let listed;
    try {
      listed = await client.call('listSpaces', {}, { signal });
    } catch (error) {
      return failed({ text: safeFailureText(error?.message ?? 'The space lookup tool failed.') });
    }
    const spaces = Array.isArray(listed?.spaces) ? listed.spaces : [];
    const spaceMatches = spaces.filter((space) => clean(space?.name).toLowerCase() === ref.toLowerCase());
    if (spaceMatches.length === 0) {
      return needsInput({ text: `I could not find a space called "${ref}". Which space do you mean?` });
    }
    if (spaceMatches.length > 1) {
      return needsInput({ text: `Multiple spaces are called "${ref}". Which one do you mean?` });
    }
    const spaceSummary = spaceMatches[0];
    const spaceName = clean(spaceSummary.name) || ref;

    // 2. Read the current members (with roles) for the guards.
    let detail;
    try {
      detail = await client.call('readSpace', { spaceId: spaceSummary.id }, { signal });
    } catch (error) {
      return failed({ text: safeFailureText(error?.message ?? 'The space lookup tool failed.') });
    }
    const space = detail?.space ?? detail ?? {};
    const members = Array.isArray(space.members) ? space.members : [];
    const memberById = new Map(members.map((member) => [member.userId, member]));

    // 3. Resolve each member query to exactly one user (ambiguous/not-found → ask).
    const resolved = [];
    for (const query of memberQueries) {
      let res;
      try {
        res = await client.call('searchUsers', { query }, { signal });
      } catch (error) {
        return failed({ text: safeFailureText(error?.message ?? 'The user lookup tool failed.') });
      }
      const users = Array.isArray(res?.users) ? res.users : [];
      if (users.length === 0) {
        return needsInput({ text: `I could not find anyone matching "${query}". Who do you mean?` });
      }
      if (users.length > 1) {
        return needsInput({ text: `More than one person matches "${query}". Who do you mean?` });
      }
      resolved.push(users[0]);
    }

    // 4. Apply the deterministic guards and build the operation.
    let operation;
    let successText;
    if (action === 'add') {
      const toAdd = resolved.filter((user) => !memberById.has(user.userId));
      if (toAdd.length === 0) {
        return needsInput({ text: `Everyone you named is already in the "${spaceName}" space.` });
      }
      operation = {
        type: 'space.addMembers',
        summary: 'Update space members.',
        targetKind: 'existing_space',
        targetId: spaceSummary.id,
        payload: { members: toAdd.map((user) => ({ userId: user.userId, role })) },
      };
      successText = `I prepared a plan to add ${toAdd.length} ${toAdd.length === 1 ? 'member' : 'members'} to the "${spaceName}" space as ${role === 'editor' ? 'an editor' : 'a viewer'}. Review the plan before applying it.`;
    } else {
      const owners = resolved.filter((user) => clean(memberById.get(user.userId)?.role).toLowerCase() === 'owner');
      if (owners.length > 0) {
        // Owner = the deterministic proxy for self / last owner; never plan this.
        return needsInput({ text: `I can't remove the owner of the "${spaceName}" space.` });
      }
      const toRemove = resolved.filter((user) => memberById.has(user.userId));
      if (toRemove.length === 0) {
        return needsInput({ text: `No one you named is currently in the "${spaceName}" space.` });
      }
      operation = {
        type: 'space.removeMembers',
        summary: 'Update space members.',
        targetKind: 'existing_space',
        targetId: spaceSummary.id,
        payload: { userIds: toRemove.map((user) => user.userId) },
      };
      successText = `I prepared a plan to remove ${toRemove.length} ${toRemove.length === 1 ? 'member' : 'members'} from the "${spaceName}" space. Review the plan before applying it.`;
    }

    // 5. Propose and gate on a persisted plan id.
    let planResult;
    try {
      planResult = await client.call(
        'proposeAlbumOperations',
        { summary: 'Update space members.', operations: [operation] },
        { signal },
      );
    } catch (error) {
      return failed({ text: safeFailureText(error?.message ?? 'The planning tool failed.') });
    }

    return gatePlanResult({
      planResult,
      successText,
      successSummary: { workflowKind: KIND, target: spaceName, label: action },
    });
  },
});
