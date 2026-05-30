import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { archiveAssetsWorkflow } from './archive-assets.mjs';

const wf = archiveAssetsWorkflow();

describe('archive_assets router & slots', () => {
  it('matches "archive <source>" with archived:true', () => {
    assert.deepEqual(wf.match('archive my newest 50 photos'), {
      slots: { archived: true, sourceDescription: 'my newest 50 photos' },
    });
  });

  it('matches "unarchive <source>" and "un-archive <source>" with archived:false', () => {
    assert.deepEqual(wf.match('unarchive my last 10 photos'), {
      slots: { archived: false, sourceDescription: 'my last 10 photos' },
    });
    assert.deepEqual(wf.match('un-archive my newest 5'), {
      slots: { archived: false, sourceDescription: 'my newest 5' },
    });
  });

  it('matches "move/take <source> out of [the] archive" with archived:false', () => {
    assert.deepEqual(wf.match('move my newest 20 photos out of archive'), {
      slots: { archived: false, sourceDescription: 'my newest 20 photos' },
    });
    assert.deepEqual(wf.match('take my 2024 photos out of the archive'), {
      slots: { archived: false, sourceDescription: 'my 2024 photos' },
    });
  });

  it('declines a subjective source at the fast-path', () => {
    assert.equal(wf.match('archive the best ones'), undefined);
  });

  it('does not match a non-archive verb (add to album)', () => {
    assert.equal(wf.match('add my newest 20 photos to Family'), undefined);
  });

  it('strips trailing punctuation from the source', () => {
    assert.deepEqual(wf.match('archive my photos.'), {
      slots: { archived: true, sourceDescription: 'my photos' },
    });
  });

  it('returns undefined for an empty prompt', () => {
    assert.equal(wf.match(''), undefined);
  });

  it('parseSlots passes a boolean polarity through from match', () => {
    assert.deepEqual(wf.parseSlots({ archived: true, sourceDescription: 'my newest 50 photos' }), {
      archived: true,
      sourceDescription: 'my newest 50 photos',
    });
  });

  it('parseSlots coerces LLM string polarity', () => {
    assert.equal(wf.parseSlots({ archived: 'unarchive', sourceDescription: 'my newest 5' }).archived, false);
    assert.equal(wf.parseSlots({ archived: 'false', sourceDescription: 'x' }).archived, false);
    assert.equal(wf.parseSlots({ archived: 'archive', sourceDescription: 'x' }).archived, true);
  });

  it('parseSlots defaults to archive when polarity is omitted', () => {
    assert.equal(wf.parseSlots({ sourceDescription: 'my newest 5' }).archived, true);
  });

  it('parseSlots rejects an empty or missing source', () => {
    assert.equal(wf.parseSlots({ archived: true, sourceDescription: '   ' }), null);
    assert.equal(wf.parseSlots({ archived: true }), null);
  });

  it('is a router-only hybrid workflow this slice (no run yet)', () => {
    assert.equal(wf.kind, 'archive_assets');
    assert.equal(wf.flow, 'hybrid');
    assert.equal(typeof wf.run, 'undefined');
  });
});
