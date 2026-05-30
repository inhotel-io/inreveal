import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { manageSpaceMembersWorkflow } from './manage-space-members.mjs';
import { makeContractClient } from './contract-fixtures.mjs';

const wf = manageSpaceMembersWorkflow();

// Family space: Pierre (owner) + Bob (viewer). Resolvable users: Alex, Alice, Bob, Pierre.
const spaceClient = (extra = {}) =>
  makeContractClient({
    spaces: [
      {
        id: 'spc-1',
        name: 'Family',
        members: [
          { userId: 'u-owner', name: 'Pierre', role: 'owner' },
          { userId: 'u-bob', name: 'Bob', role: 'viewer' },
        ],
      },
    ],
    users: [
      { userId: 'u-alex', name: 'Alex', email: 'alex@x.com' },
      { userId: 'u-alice', name: 'Alice', email: 'alice@x.com' },
      { userId: 'u-bob', name: 'Bob', email: 'bob@x.com' },
      { userId: 'u-owner', name: 'Pierre', email: 'pierre@x.com' },
    ],
    ...extra,
  });

const spaceOp = (client) => client.calls.find((c) => c.name === 'proposeAlbumOperations')?.args.operations[0];
const proposed = (client) => client.calls.some((c) => c.name === 'proposeAlbumOperations');

describe('manage_space_members router & slots', () => {
  it('matches "add <user> to the <space> space as <role>"', () => {
    assert.deepEqual(wf.match('add Alex to the Family space as editor'), {
      slots: { action: 'add', memberQueries: ['Alex'], spaceRef: 'Family', role: 'editor' },
    });
  });

  it('matches an add without a role (gated by the space keyword)', () => {
    assert.deepEqual(wf.match('add Sam to the Trips space'), {
      slots: { action: 'add', memberQueries: ['Sam'], spaceRef: 'Trips' },
    });
  });

  it('splits multiple members', () => {
    assert.deepEqual(wf.match('add Alex and Sam to the Family space'), {
      slots: { action: 'add', memberQueries: ['Alex', 'Sam'], spaceRef: 'Family' },
    });
  });

  it('accepts a role gate without the "space" word', () => {
    assert.deepEqual(wf.match('add Alex to Family as a viewer'), {
      slots: { action: 'add', memberQueries: ['Alex'], spaceRef: 'Family', role: 'viewer' },
    });
  });

  it('matches a remove with the space keyword', () => {
    assert.deepEqual(wf.match('remove Alex from the Family space'), {
      slots: { action: 'remove', memberQueries: ['Alex'], spaceRef: 'Family' },
    });
  });

  it('declines a remove with no space keyword', () => {
    assert.equal(wf.match('remove Alex from Family'), undefined);
  });

  it('does not steal a photo add or a tag add', () => {
    assert.equal(wf.match('add my newest 20 photos to Family'), undefined);
    assert.equal(wf.match('add the tag Spring Break to my newest 50 photos'), undefined);
  });

  it('returns undefined for an empty prompt', () => {
    assert.equal(wf.match(''), undefined);
  });

  it('parseSlots defaults the add role to viewer', () => {
    assert.equal(wf.parseSlots({ action: 'add', memberQueries: ['Alex'], spaceRef: 'Family' }).role, 'viewer');
  });

  it('parseSlots normalizes role synonyms', () => {
    assert.equal(
      wf.parseSlots({ action: 'add', memberQueries: ['Alex'], spaceRef: 'Family', role: 'contributor' }).role,
      'editor',
    );
    assert.equal(
      wf.parseSlots({ action: 'add', memberQueries: ['Alex'], spaceRef: 'Family', role: 'admin' }).role,
      'owner',
    );
  });

  it('parseSlots accepts an LLM and/comma member string', () => {
    assert.deepEqual(wf.parseSlots({ action: 'add', spaceRef: 'Family', memberQueries: 'Alex and Sam' }).memberQueries, [
      'Alex',
      'Sam',
    ]);
  });

  it('parseSlots drops role on remove', () => {
    const slots = wf.parseSlots({ action: 'remove', memberQueries: ['Alex'], spaceRef: 'Family', role: 'editor' });
    assert.equal('role' in slots, false);
  });

  it('parseSlots rejects empty members, empty space, or a bad action', () => {
    assert.equal(wf.parseSlots({ action: 'add', spaceRef: 'Family', memberQueries: [] }), null);
    assert.equal(wf.parseSlots({ action: 'add', memberQueries: ['Alex'] }), null);
    assert.equal(wf.parseSlots({ action: 'frobnicate', spaceRef: 'Family', memberQueries: ['Alex'] }), null);
  });

  it('is a strict workflow with an executable run', () => {
    assert.equal(wf.kind, 'manage_space_members');
    assert.equal(wf.flow, 'strict');
    assert.equal(typeof wf.run, 'function');
  });
});

describe('manage_space_members execution + safety guards', () => {
  it('plans a unique add with a role and keeps user ids out of the copy', async () => {
    const client = spaceClient();
    const outcome = await wf.run({
      client,
      slots: { action: 'add', memberQueries: ['Alex'], spaceRef: 'Family', role: 'editor' },
    });
    assert.equal(outcome.status, 'planned');
    assert.deepEqual(spaceOp(client), {
      type: 'space.addMembers',
      summary: 'Update space members.',
      targetKind: 'existing_space',
      targetId: 'spc-1',
      payload: { members: [{ userId: 'u-alex', role: 'editor' }] },
    });
    assert.equal(outcome.text.includes('u-alex'), false);
  });

  it('asks which user when the member query is ambiguous (no propose)', async () => {
    const client = spaceClient();
    const outcome = await wf.run({ client, slots: { action: 'add', memberQueries: ['Al'], spaceRef: 'Family', role: 'viewer' } });
    assert.equal(outcome.status, 'needs_input');
    assert.equal(proposed(client), false);
  });

  it('asks for input when a member is not found (no propose)', async () => {
    const client = spaceClient();
    const outcome = await wf.run({ client, slots: { action: 'add', memberQueries: ['Zzz'], spaceRef: 'Family', role: 'viewer' } });
    assert.equal(outcome.status, 'needs_input');
    assert.equal(proposed(client), false);
  });

  it('does not re-add an existing member (already-member → needs_input)', async () => {
    const client = spaceClient();
    const outcome = await wf.run({ client, slots: { action: 'add', memberQueries: ['Bob'], spaceRef: 'Family', role: 'editor' } });
    assert.equal(outcome.status, 'needs_input');
    assert.equal(proposed(client), false);
  });

  it('skips an already-present member and plans only the new ones', async () => {
    const client = spaceClient();
    // Bob is already a viewer member; Alex is new. Plan adds only Alex.
    const outcome = await wf.run({
      client,
      slots: { action: 'add', memberQueries: ['Bob', 'Alex'], spaceRef: 'Family', role: 'viewer' },
    });
    assert.equal(outcome.status, 'planned');
    assert.deepEqual(spaceOp(client).payload, { members: [{ userId: 'u-alex', role: 'viewer' }] });
  });

  it('plans a member removal (no user ids in the copy)', async () => {
    const client = spaceClient();
    const outcome = await wf.run({ client, slots: { action: 'remove', memberQueries: ['Bob'], spaceRef: 'Family' } });
    assert.equal(outcome.status, 'planned');
    assert.deepEqual(spaceOp(client), {
      type: 'space.removeMembers',
      summary: 'Update space members.',
      targetKind: 'existing_space',
      targetId: 'spc-1',
      payload: { userIds: ['u-bob'] },
    });
    assert.equal(outcome.text.includes('u-bob'), false);
  });

  it('asks for input when removing a non-member (no propose)', async () => {
    const client = spaceClient();
    const outcome = await wf.run({ client, slots: { action: 'remove', memberQueries: ['Alex'], spaceRef: 'Family' } });
    assert.equal(outcome.status, 'needs_input');
    assert.equal(proposed(client), false);
  });

  it('blocks removing the space owner (covers self + last-owner) → needs_input', async () => {
    const client = spaceClient();
    const outcome = await wf.run({ client, slots: { action: 'remove', memberQueries: ['Pierre'], spaceRef: 'Family' } });
    assert.equal(outcome.status, 'needs_input');
    assert.equal(proposed(client), false);
  });

  it('refuses to add a member as owner (owner is not assignable) → needs_input', async () => {
    const client = spaceClient();
    const outcome = await wf.run({ client, slots: { action: 'add', memberQueries: ['Alex'], spaceRef: 'Family', role: 'owner' } });
    assert.equal(outcome.status, 'needs_input');
    assert.equal(proposed(client), false);
  });

  it('asks which space when the space is unknown or ambiguous', async () => {
    const unknown = spaceClient();
    assert.equal(
      (await wf.run({ unknown, client: unknown, slots: { action: 'add', memberQueries: ['Alex'], spaceRef: 'Nope', role: 'viewer' } })).status,
      'needs_input',
    );
    const ambiguous = makeContractClient({
      spaces: [
        { id: 'a', name: 'Family', members: [] },
        { id: 'b', name: 'Family', members: [] },
      ],
      users: [{ userId: 'u-alex', name: 'Alex', email: 'alex@x.com' }],
    });
    const outcome = await wf.run({ client: ambiguous, slots: { action: 'add', memberQueries: ['Alex'], spaceRef: 'Family', role: 'viewer' } });
    assert.equal(outcome.status, 'needs_input');
    assert.equal(proposed(ambiguous), false);
  });

  it('fails when listSpaces, readSpace, or searchUsers throws', async () => {
    const throwingOn = (toolName) => ({
      calls: [],
      async call(name) {
        this.calls.push({ name });
        if (name === toolName) throw new Error('boom');
        if (name === 'listSpaces') return { spaces: [{ id: 'spc-1', name: 'Family' }] };
        if (name === 'readSpace') return { space: { id: 'spc-1', name: 'Family', members: [] } };
        if (name === 'searchUsers') return { users: [{ userId: 'u-alex', name: 'Alex' }] };
        throw new Error(`unexpected ${name}`);
      },
    });
    for (const tool of ['listSpaces', 'readSpace', 'searchUsers']) {
      const outcome = await wf.run({
        client: throwingOn(tool),
        slots: { action: 'add', memberQueries: ['Alex'], spaceRef: 'Family', role: 'viewer' },
      });
      assert.equal(outcome.status, 'failed', `expected failed when ${tool} throws`);
    }
  });

  it('fails (gate) without success copy when the plan has no persisted id', async () => {
    const client = spaceClient({ planResult: { status: 'success', plan: {} } });
    const outcome = await wf.run({ client, slots: { action: 'add', memberQueries: ['Alex'], spaceRef: 'Family', role: 'editor' } });
    assert.equal(outcome.status, 'failed');
    assert.equal(/prepared/i.test(outcome.text), false);
  });
});
