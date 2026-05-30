import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { tagAssetsWorkflow } from './tag-assets.mjs';

const wf = tagAssetsWorkflow();

describe('tag_assets router & slots (add-only)', () => {
  it('matches "tag <source> as <tag>"', () => {
    assert.deepEqual(wf.match('tag my newest 20 photos as Travel'), {
      slots: { sourceDescription: 'my newest 20 photos', tagName: 'Travel' },
    });
  });

  it('extracts a quoted multi-word tag', () => {
    assert.deepEqual(wf.match('tag my newest 20 as "Spring Break"'), {
      slots: { sourceDescription: 'my newest 20', tagName: 'Spring Break' },
    });
  });

  it('matches both "add the tag <tag> to <source>" and "add the <tag> tag to <source>"', () => {
    assert.deepEqual(wf.match('add the tag Travel to my newest 20 photos'), {
      slots: { sourceDescription: 'my newest 20 photos', tagName: 'Travel' },
    });
    assert.deepEqual(wf.match('add the Travel tag to my newest 20'), {
      slots: { sourceDescription: 'my newest 20', tagName: 'Travel' },
    });
  });

  it('does not match removal / untag phrasings (add-only)', () => {
    assert.equal(wf.match('remove the Travel tag from my newest 20'), undefined);
    assert.equal(wf.match('untag my newest 20 photos'), undefined);
  });

  it('declines a subjective source at the fast-path', () => {
    assert.equal(wf.match('tag the best ones as Travel'), undefined);
  });

  it('strips trailing punctuation and rejects empty prompt', () => {
    assert.deepEqual(wf.match('tag my photos as Travel.'), {
      slots: { sourceDescription: 'my photos', tagName: 'Travel' },
    });
    assert.equal(wf.match(''), undefined);
  });

  it('parseSlots passes valid slots through and strips quotes on the LLM path', () => {
    assert.deepEqual(wf.parseSlots({ sourceDescription: 'my newest 20', tagName: 'Travel' }), {
      sourceDescription: 'my newest 20',
      tagName: 'Travel',
    });
    assert.equal(wf.parseSlots({ sourceDescription: 'x', tagName: '"Spring Break"' }).tagName, 'Spring Break');
  });

  it('parseSlots rejects an empty tag or empty/missing source', () => {
    assert.equal(wf.parseSlots({ sourceDescription: 'x', tagName: '   ' }), null);
    assert.equal(wf.parseSlots({ sourceDescription: '  ', tagName: 'Travel' }), null);
    assert.equal(wf.parseSlots({ sourceDescription: 'x' }), null);
  });

  it('is a router-only hybrid workflow this slice (no run yet)', () => {
    assert.equal(wf.kind, 'tag_assets');
    assert.equal(wf.flow, 'hybrid');
    assert.equal(typeof wf.run, 'undefined');
  });
});
