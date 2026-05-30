import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { changeMemberRoleWorkflow } from './change-member-role.mjs';
import { makeContractClient } from './contract-fixtures.mjs';

const wf = changeMemberRoleWorkflow();

// Family: Pierre (owner), Bob (viewer), Carol (editor). Resolvable: Alex, Alice, Bob, Carol, Pierre.
const spaceClient = (extra = {}) =>
  makeContractClient({
    spaces: [
      {
        id: 'spc-1',
        name: 'Family',
        members: [
          { userId: 'u-owner', name: 'Pierre', role: 'owner' },
          { userId: 'u-bob', name: 'Bob', role: 'viewer' },
          { userId: 'u-carol', name: 'Carol', role: 'editor' },
        ],
      },
    ],
    users: [
      { userId: 'u-alex', name: 'Alex', email: 'alex@x.com' },
      { userId: 'u-alice', name: 'Alice', email: 'alice@x.com' },
      { userId: 'u-bob', name: 'Bob', email: 'bob@x.com' },
      { userId: 'u-carol', name: 'Carol', email: 'carol@x.com' },
      { userId: 'u-owner', name: 'Pierre', email: 'pierre@x.com' },
    ],
    ...extra,
  });

const spaceOp = (client) => client.calls.find((c) => c.name === 'proposeAlbumOperations')?.args.operations[0];
const proposed = (client) => client.calls.some((c) => c.name === 'proposeAlbumOperations');

describe('change_member_role router & slots', () => {
  it('matches "make <user> an editor in <space>"', () => {
    assert.deepEqual(wf.match('make Alex an editor in Family'), {
      slots: { memberQuery: 'Alex', role: 'editor', spaceRef: 'Family' },
    });
  });

  it('matches "make <user> a viewer in the <space> space"', () => {
    assert.deepEqual(wf.match('make Alex a viewer in the Family space'), {
      slots: { memberQuery: 'Alex', role: 'viewer', spaceRef: 'Family' },
    });
  });

  it('matches "change <user>\'s role to <role> in <space>"', () => {
    assert.deepEqual(wf.match("change Alex's role to editor in Family"), {
      slots: { memberQuery: 'Alex', role: 'editor', spaceRef: 'Family' },
    });
  });

  it('captures owner intent ("make <user> the owner of <space>")', () => {
    assert.deepEqual(wf.match('make Alex the owner of Family'), {
      slots: { memberQuery: 'Alex', role: 'owner', spaceRef: 'Family' },
    });
  });

  it('handles a possessive in a "space" target', () => {
    assert.deepEqual(wf.match("change Bob's role to viewer in the Trips space"), {
      slots: { memberQuery: 'Bob', role: 'viewer', spaceRef: 'Trips' },
    });
  });

  it('normalizes role synonyms', () => {
    assert.deepEqual(wf.match('make Alex a contributor in Family'), {
      slots: { memberQuery: 'Alex', role: 'editor', spaceRef: 'Family' },
    });
  });

  it('does not match without a valid role word', () => {
    assert.equal(wf.match('make Alex happy in Family'), undefined);
  });

  it('does not match a space rename', () => {
    assert.equal(wf.match('rename the Family space to Family 2026'), undefined);
  });

  it('returns undefined for an empty prompt', () => {
    assert.equal(wf.match(''), undefined);
  });

  it('parseSlots normalizes role + space and requires all three slots', () => {
    assert.deepEqual(wf.parseSlots({ memberQuery: 'Alex', role: 'admin', spaceRef: 'the Family space' }), {
      memberQuery: 'Alex',
      role: 'owner',
      spaceRef: 'Family',
    });
    assert.equal(wf.parseSlots({ memberQuery: 'Alex', role: 'editor' }), null);
    assert.equal(wf.parseSlots({ role: 'editor', spaceRef: 'Family' }), null);
    assert.equal(wf.parseSlots({ memberQuery: 'Alex', role: 'bogus', spaceRef: 'Family' }), null);
  });

  it('is a strict workflow with an executable run', () => {
    assert.equal(wf.kind, 'change_member_role');
    assert.equal(wf.flow, 'strict');
    assert.equal(typeof wf.run, 'function');
  });
});

describe('change_member_role execution + guards', () => {
  it('plans a viewer→editor change and keeps user ids out of the copy', async () => {
    const client = spaceClient();
    const outcome = await wf.run({ client, slots: { memberQuery: 'Bob', role: 'editor', spaceRef: 'Family' } });
    assert.equal(outcome.status, 'planned');
    assert.deepEqual(spaceOp(client), {
      type: 'space.updateMemberRole',
      summary: 'Update a space member role.',
      targetKind: 'existing_space',
      targetId: 'spc-1',
      payload: { userIds: ['u-bob'], role: 'editor' },
    });
    assert.equal(outcome.text.includes('u-bob'), false);
  });

  it('plans an editor→viewer change', async () => {
    const client = spaceClient();
    const outcome = await wf.run({ client, slots: { memberQuery: 'Carol', role: 'viewer', spaceRef: 'Family' } });
    assert.equal(outcome.status, 'planned');
    assert.deepEqual(spaceOp(client).payload, { userIds: ['u-carol'], role: 'viewer' });
  });

  it('treats a no-op role change as needs_input (no propose)', async () => {
    const client = spaceClient();
    const outcome = await wf.run({ client, slots: { memberQuery: 'Bob', role: 'viewer', spaceRef: 'Family' } });
    assert.equal(outcome.status, 'needs_input');
    assert.equal(proposed(client), false);
  });

  it('blocks demoting the owner (self / last-owner) → needs_input', async () => {
    const client = spaceClient();
    const outcome = await wf.run({ client, slots: { memberQuery: 'Pierre', role: 'editor', spaceRef: 'Family' } });
    assert.equal(outcome.status, 'needs_input');
    assert.equal(proposed(client), false);
  });

  it('refuses to promote to owner (not assignable) without touching tools', async () => {
    const client = spaceClient();
    const outcome = await wf.run({ client, slots: { memberQuery: 'Bob', role: 'owner', spaceRef: 'Family' } });
    assert.equal(outcome.status, 'needs_input');
    assert.equal(client.calls.length, 0);
  });

  it('asks for input when the target is not a member', async () => {
    const client = spaceClient();
    const outcome = await wf.run({ client, slots: { memberQuery: 'Alex', role: 'editor', spaceRef: 'Family' } });
    assert.equal(outcome.status, 'needs_input');
    assert.equal(proposed(client), false);
  });

  it('asks which user when the member query is ambiguous', async () => {
    const client = spaceClient();
    const outcome = await wf.run({ client, slots: { memberQuery: 'Al', role: 'editor', spaceRef: 'Family' } });
    assert.equal(outcome.status, 'needs_input');
    assert.equal(proposed(client), false);
  });

  it('asks which space when the space is unknown', async () => {
    const client = spaceClient();
    const outcome = await wf.run({ client, slots: { memberQuery: 'Bob', role: 'editor', spaceRef: 'Nope' } });
    assert.equal(outcome.status, 'needs_input');
    assert.equal(proposed(client), false);
  });

  it('fails when listSpaces, readSpace, or searchUsers throws', async () => {
    const throwingOn = (toolName) => ({
      calls: [],
      async call(name) {
        this.calls.push({ name });
        if (name === toolName) throw new Error('boom');
        if (name === 'listSpaces') return { spaces: [{ id: 'spc-1', name: 'Family' }] };
        if (name === 'readSpace')
          return { space: { id: 'spc-1', name: 'Family', members: [{ userId: 'u-bob', name: 'Bob', role: 'viewer' }] } };
        if (name === 'searchUsers') return { users: [{ userId: 'u-bob', name: 'Bob' }] };
        throw new Error(`unexpected ${name}`);
      },
    });
    for (const tool of ['listSpaces', 'readSpace', 'searchUsers']) {
      const outcome = await wf.run({ client: throwingOn(tool), slots: { memberQuery: 'Bob', role: 'editor', spaceRef: 'Family' } });
      assert.equal(outcome.status, 'failed', `expected failed when ${tool} throws`);
    }
  });

  it('fails (gate) without success copy when the plan has no persisted id', async () => {
    const client = spaceClient({ planResult: { status: 'success', plan: {} } });
    const outcome = await wf.run({ client, slots: { memberQuery: 'Bob', role: 'editor', spaceRef: 'Family' } });
    assert.equal(outcome.status, 'failed');
    assert.equal(/prepared/i.test(outcome.text), false);
  });
});
