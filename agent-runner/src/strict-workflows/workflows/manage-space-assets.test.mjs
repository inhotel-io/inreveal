import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { manageSpaceAssetsWorkflow } from './manage-space-assets.mjs';

const wf = manageSpaceAssetsWorkflow();

describe('manage_space_assets router — match()', () => {
  it('matches "add my newest 20 photos to the Family space"', () => {
    assert.deepEqual(wf.match('add my newest 20 photos to the Family space'), {
      slots: { action: 'add', spaceRef: 'Family', sourceDescription: 'my newest 20 photos' },
    });
  });

  it('matches "remove my screenshots from the Family space"', () => {
    assert.deepEqual(wf.match('remove my screenshots from the Family space'), {
      slots: { action: 'remove', spaceRef: 'Family', sourceDescription: 'my screenshots' },
    });
  });

  it('matches "add my photos from 2024 to the Trips space"', () => {
    assert.deepEqual(wf.match('add my photos from 2024 to the Trips space'), {
      slots: { action: 'add', spaceRef: 'Trips', sourceDescription: 'my photos from 2024' },
    });
  });

  it('returns undefined for a member add (not a photo source)', () => {
    assert.equal(wf.match('add Alex to the Family space'), undefined);
  });

  it('returns undefined for multiple members', () => {
    assert.equal(wf.match('add Alex and Sam to the Family space'), undefined);
  });

  it('returns undefined when there is no "space" keyword in the target', () => {
    assert.equal(wf.match('add my newest 20 photos to Family'), undefined);
  });

  it('returns undefined for an album target (no space keyword)', () => {
    assert.equal(wf.match('add my newest 20 photos to the Trips album'), undefined);
  });

  it('returns undefined with no space target at all', () => {
    assert.equal(wf.match('archive my newest 50 photos'), undefined);
  });

  it('returns undefined when "remove … from Family" has no "space" keyword', () => {
    assert.equal(wf.match('remove my screenshots from Family'), undefined);
  });

  it('returns undefined for an empty prompt', () => {
    assert.equal(wf.match(''), undefined);
  });

  it('returns undefined for a subjective source', () => {
    assert.equal(wf.match('add the best photos to the Family space'), undefined);
  });
});

describe('manage_space_assets router — parseSlots()', () => {
  it('normalizes a spaceRef that includes "the … space"', () => {
    assert.deepEqual(
      wf.parseSlots({ action: 'add', spaceRef: 'the Family space', sourceDescription: 'my newest 20 photos' }),
      { action: 'add', spaceRef: 'Family', sourceDescription: 'my newest 20 photos' },
    );
  });

  it('returns null when sourceDescription is blank', () => {
    assert.equal(wf.parseSlots({ action: 'remove', spaceRef: 'Family', sourceDescription: '  ' }), null);
  });

  it('infers action from the prompt verb when the slot is missing', () => {
    assert.deepEqual(
      wf.parseSlots(
        { spaceRef: 'Family', sourceDescription: 'my newest 20 photos' },
        'add my newest 20 photos to the Family space',
      ),
      { action: 'add', spaceRef: 'Family', sourceDescription: 'my newest 20 photos' },
    );
  });

  it('returns null when action is unknown and not inferable', () => {
    assert.equal(wf.parseSlots({ action: 'frobnicate', spaceRef: 'Family', sourceDescription: 'x' }), null);
  });

  it('returns null when spaceRef is missing', () => {
    assert.equal(wf.parseSlots({ action: 'add', sourceDescription: 'my newest 20 photos' }), null);
  });
});

describe('manage_space_assets identity', () => {
  it('has the correct kind, flow, and a run function', () => {
    assert.equal(wf.kind, 'manage_space_assets');
    assert.equal(wf.flow, 'hybrid');
    assert.equal(typeof wf.run, 'function');
  });
});
