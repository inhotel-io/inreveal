import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createAlbumFromSourceWorkflow } from './create-album-from-source.mjs';

const wf = createAlbumFromSourceWorkflow();

describe('create_album_from_source router & slots', () => {
  it('matches "make an album of <source>" (no name yet)', () => {
    assert.deepEqual(wf.match('make an album of my newest 50 photos'), {
      slots: { sourceDescription: 'my newest 50 photos' },
    });
  });

  it('captures an explicit album name', () => {
    assert.deepEqual(wf.match('create an album from my newest 50 photos called Recent'), {
      slots: { sourceDescription: 'my newest 50 photos', albumName: 'Recent' },
    });
  });

  it('strips quotes from a titled name', () => {
    assert.deepEqual(wf.match('make a new album of my newest 20 photos titled "Spring Break"'), {
      slots: { sourceDescription: 'my newest 20 photos', albumName: 'Spring Break' },
    });
  });

  it('declines a recent-trip source (owned by the trip workflow)', () => {
    assert.equal(wf.match('make an album for my recent trip'), undefined);
  });

  it('declines a subjective source', () => {
    assert.equal(wf.match('create an album of the best photos from last weekend'), undefined);
  });

  it('does not match an add-to-existing-album', () => {
    assert.equal(wf.match('add my newest 20 to Family'), undefined);
  });

  it('strips trailing punctuation and rejects an empty prompt', () => {
    assert.deepEqual(wf.match('make an album of my photos.'), { slots: { sourceDescription: 'my photos' } });
    assert.equal(wf.match(''), undefined);
  });

  it('parseSlots defaults the album name and strips quotes', () => {
    assert.deepEqual(wf.parseSlots({ sourceDescription: 'my newest 50 photos' }), {
      sourceDescription: 'my newest 50 photos',
      albumName: 'New Album',
    });
    assert.equal(wf.parseSlots({ sourceDescription: 'my newest 50 photos', albumName: '"Recent"' }).albumName, 'Recent');
  });

  it('parseSlots rejects an empty or missing source', () => {
    assert.equal(wf.parseSlots({ sourceDescription: '   ' }), null);
    assert.equal(wf.parseSlots({ albumName: 'X' }), null);
  });

  it('is a router-only hybrid workflow this slice (no run yet)', () => {
    assert.equal(wf.kind, 'create_album_from_source');
    assert.equal(wf.flow, 'hybrid');
    assert.equal(typeof wf.run, 'undefined');
  });
});
