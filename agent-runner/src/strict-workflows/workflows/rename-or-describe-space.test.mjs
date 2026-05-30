import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renameOrDescribeSpaceWorkflow } from './rename-or-describe-space.mjs';

const wf = renameOrDescribeSpaceWorkflow();

describe('rename_or_describe_space router & slots', () => {
  it('matches "rename the <space> space to <name>"', () => {
    assert.deepEqual(wf.match('rename the Family space to Family 2026'), {
      slots: { spaceRef: 'Family', newName: 'Family 2026' },
    });
  });

  it('matches "set the description on the <space> space to <text>"', () => {
    assert.deepEqual(wf.match('set the description on the Family space to Our shared memories'), {
      slots: { spaceRef: 'Family', description: 'Our shared memories' },
    });
  });

  it('handles the "shared space <name>" wrapper', () => {
    assert.deepEqual(wf.match('rename the shared space Trips to Trips 2026'), {
      slots: { spaceRef: 'Trips', newName: 'Trips 2026' },
    });
  });

  it('matches a "this space" deixis describe', () => {
    const m = wf.match('set the description on this space to Welcome');
    assert.ok(m, 'expected a match');
    assert.equal(m.slots.description, 'Welcome');
    assert.ok(m.slots.spaceRef);
  });

  it('does not match album phrasings (no space keyword)', () => {
    assert.equal(wf.match('rename the Family album to Family 2026'), undefined);
  });

  it('does not match a generic ref with no space keyword (defaults to album)', () => {
    assert.equal(wf.match('rename Family to Family 2026'), undefined);
  });

  it('returns undefined for an empty prompt', () => {
    assert.equal(wf.match(''), undefined);
  });

  it('parseSlots normalizes the ref and accepts a single field', () => {
    assert.deepEqual(wf.parseSlots({ spaceRef: 'the Family space', newName: 'Family 2026' }), {
      spaceRef: 'Family',
      newName: 'Family 2026',
    });
  });

  it('parseSlots accepts both name and description', () => {
    assert.deepEqual(wf.parseSlots({ spaceRef: 'Family', newName: 'Family 2026', description: 'Welcome' }), {
      spaceRef: 'Family',
      newName: 'Family 2026',
      description: 'Welcome',
    });
  });

  it('parseSlots rejects when neither name nor description is present', () => {
    assert.equal(wf.parseSlots({ spaceRef: 'Family' }), null);
  });

  it('parseSlots rejects a missing space ref', () => {
    assert.equal(wf.parseSlots({ newName: 'X' }), null);
  });

  it('is a router-only strict workflow this slice (no run yet)', () => {
    assert.equal(wf.kind, 'rename_or_describe_space');
    assert.equal(wf.flow, 'strict');
    assert.equal(typeof wf.run, 'undefined');
  });
});
