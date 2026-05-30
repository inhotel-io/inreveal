import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSpaceFromSourceWorkflow } from './create-space-from-source.mjs';

const wf = createSpaceFromSourceWorkflow();

describe('create_space_from_source router & slots', () => {
  it('matches inline name form "make a <Name> space of <source>"', () => {
    assert.deepEqual(wf.match('make a Family space of my newest 50 photos'), {
      slots: { sourceDescription: 'my newest 50 photos', spaceName: 'Family' },
    });
  });

  it('matches trailing name form "create a space from <source> called <Name>"', () => {
    assert.deepEqual(wf.match('create a space from my newest 50 photos called Trips'), {
      slots: { sourceDescription: 'my newest 50 photos', spaceName: 'Trips' },
    });
  });

  it('strips quotes from a titled name', () => {
    assert.deepEqual(wf.match('make a space of my newest 20 photos titled "South Africa"'), {
      slots: { sourceDescription: 'my newest 20 photos', spaceName: 'South Africa' },
    });
  });

  it('matches no-name form (no spaceName in slots)', () => {
    assert.deepEqual(wf.match('create a space from my 2024 photos'), {
      slots: { sourceDescription: 'my 2024 photos' },
    });
  });

  it('tolerates "shared space" without capturing "shared" as a name', () => {
    assert.deepEqual(wf.match('create a shared space of my newest 50 photos'), {
      slots: { sourceDescription: 'my newest 50 photos' },
    });
  });

  it('does not match "album" noun', () => {
    assert.equal(wf.match('make an album of my newest 50 photos'), undefined);
  });

  it('declines a subjective source', () => {
    assert.equal(wf.match('create a space of the best photos from last weekend'), undefined);
  });

  it('does not match a rename prompt', () => {
    assert.equal(wf.match('rename the Family space to Family 2026'), undefined);
  });

  it('does not match a member-add prompt', () => {
    assert.equal(wf.match('add Alex to the Family space'), undefined);
  });

  it('does not match a photo-add-to-existing-space prompt', () => {
    assert.equal(wf.match('add my newest 20 photos to the Family space'), undefined);
  });

  it('rejects an empty prompt', () => {
    assert.equal(wf.match(''), undefined);
  });

  it('strips trailing punctuation from source', () => {
    assert.deepEqual(wf.match('make a space of my photos.'), {
      slots: { sourceDescription: 'my photos' },
    });
  });

  it('parseSlots defaults spaceName to "New Space"', () => {
    assert.deepEqual(wf.parseSlots({ sourceDescription: 'my newest 50 photos' }), {
      sourceDescription: 'my newest 50 photos',
      spaceName: 'New Space',
    });
  });

  it('parseSlots strips quotes from spaceName', () => {
    assert.equal(
      wf.parseSlots({ sourceDescription: 'my newest 50 photos', spaceName: '"Trips"' }).spaceName,
      'Trips',
    );
  });

  it('parseSlots rejects a whitespace-only sourceDescription', () => {
    assert.equal(wf.parseSlots({ sourceDescription: '   ' }), null);
  });

  it('parseSlots rejects a missing sourceDescription', () => {
    assert.equal(wf.parseSlots({ spaceName: 'X' }), null);
  });

  it('has the correct identity fields and a run function', () => {
    assert.equal(wf.kind, 'create_space_from_source');
    assert.equal(wf.flow, 'hybrid');
    assert.equal(typeof wf.run, 'function');
  });
});
