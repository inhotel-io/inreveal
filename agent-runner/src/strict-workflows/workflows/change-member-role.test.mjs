import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { changeMemberRoleWorkflow } from './change-member-role.mjs';

const wf = changeMemberRoleWorkflow();

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

  it('is a router-only strict workflow this slice (no run yet)', () => {
    assert.equal(wf.kind, 'change_member_role');
    assert.equal(wf.flow, 'strict');
    assert.equal(typeof wf.run, 'undefined');
  });
});
