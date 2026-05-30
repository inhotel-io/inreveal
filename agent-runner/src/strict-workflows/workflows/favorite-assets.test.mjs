import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { favoriteAssetsWorkflow } from './favorite-assets.mjs';

const wf = favoriteAssetsWorkflow();

describe('favorite_assets router & slots', () => {
  it('matches "favorite <source>" (and British spelling) with favorite:true', () => {
    assert.deepEqual(wf.match('favorite my last 10 photos'), {
      slots: { favorite: true, sourceDescription: 'my last 10 photos' },
    });
    assert.deepEqual(wf.match('favourite my newest 20 photos'), {
      slots: { favorite: true, sourceDescription: 'my newest 20 photos' },
    });
  });

  it('matches unfavorite / remove-favorite phrasings with favorite:false', () => {
    assert.deepEqual(wf.match('unfavorite my newest 5 photos'), {
      slots: { favorite: false, sourceDescription: 'my newest 5 photos' },
    });
    assert.deepEqual(wf.match('remove favorite from my newest 5'), {
      slots: { favorite: false, sourceDescription: 'my newest 5' },
    });
  });

  it('matches like / unlike polarity', () => {
    assert.deepEqual(wf.match('like my newest 10 photos'), {
      slots: { favorite: true, sourceDescription: 'my newest 10 photos' },
    });
    assert.deepEqual(wf.match('unlike my newest 10 photos'), {
      slots: { favorite: false, sourceDescription: 'my newest 10 photos' },
    });
  });

  it('declines a subjective source at the fast-path', () => {
    assert.equal(wf.match('favorite the best 3'), undefined);
  });

  it('does not match a mid-sentence "like"', () => {
    assert.equal(wf.match('I really like my photos'), undefined);
  });

  it('strips trailing punctuation and rejects empty prompt', () => {
    assert.deepEqual(wf.match('favorite my photos.'), {
      slots: { favorite: true, sourceDescription: 'my photos' },
    });
    assert.equal(wf.match(''), undefined);
  });

  it('parseSlots passes a boolean polarity through and coerces LLM strings', () => {
    assert.deepEqual(wf.parseSlots({ favorite: true, sourceDescription: 'my newest 5' }), {
      favorite: true,
      sourceDescription: 'my newest 5',
    });
    assert.equal(wf.parseSlots({ favorite: 'unfavorite', sourceDescription: 'x' }).favorite, false);
    assert.equal(wf.parseSlots({ favorite: 'false', sourceDescription: 'x' }).favorite, false);
  });

  it('parseSlots defaults to favorite when polarity is omitted', () => {
    assert.equal(wf.parseSlots({ sourceDescription: 'my newest 5' }).favorite, true);
  });

  it('parseSlots rejects an empty or missing source', () => {
    assert.equal(wf.parseSlots({ favorite: true, sourceDescription: '  ' }), null);
    assert.equal(wf.parseSlots({ favorite: true }), null);
  });

  it('is a router-only hybrid workflow this slice (no run yet)', () => {
    assert.equal(wf.kind, 'favorite_assets');
    assert.equal(wf.flow, 'hybrid');
    assert.equal(typeof wf.run, 'undefined');
  });
});
