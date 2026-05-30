import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { manageSpaceMembersWorkflow } from './manage-space-members.mjs';

const wf = manageSpaceMembersWorkflow();

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

  it('is a router-only strict workflow this slice (no run yet)', () => {
    assert.equal(wf.kind, 'manage_space_members');
    assert.equal(wf.flow, 'strict');
    assert.equal(typeof wf.run, 'undefined');
  });
});
