import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { removePhotosFromAlbumWorkflow } from './remove-photos-from-album.mjs';

const wf = removePhotosFromAlbumWorkflow();

describe('remove_photos_from_album workflow — identity', () => {
  it('has the right kind and flow', () => {
    assert.equal(wf.kind, 'remove_photos_from_album');
    assert.equal(wf.flow, 'hybrid');
    assert.equal(typeof wf.run, 'function');
  });
});

describe('remove_photos_from_album workflow — match()', () => {
  it('matches "remove my newest 20 photos from Family"', () => {
    assert.deepEqual(wf.match('remove my newest 20 photos from Family'), {
      slots: { albumRef: 'Family', sourceDescription: 'my newest 20 photos' },
    });
  });

  it('matches "take my newest 20 photos out of the Family album"', () => {
    assert.deepEqual(wf.match('take my newest 20 photos out of the Family album'), {
      slots: { albumRef: 'Family', sourceDescription: 'my newest 20 photos' },
    });
  });

  it('matches multi-from source — binds the FINAL "from <album>"', () => {
    assert.deepEqual(wf.match('remove my photos from 2024 from the Trips album'), {
      slots: { albumRef: 'Trips', sourceDescription: 'my photos from 2024' },
    });
  });

  it('returns undefined for "remove Bob from the Family space" (space keyword)', () => {
    assert.equal(wf.match('remove Bob from the Family space'), undefined);
  });

  it('returns undefined for "remove my newest 20 from my favorites" (favorites tail)', () => {
    assert.equal(wf.match('remove my newest 20 from my favorites'), undefined);
  });

  it('returns undefined for "remove the Travel tag from my newest 20" (tag phrasing)', () => {
    assert.equal(wf.match('remove the Travel tag from my newest 20'), undefined);
  });

  it('returns undefined for "remove the best ones from Family" (subjective source)', () => {
    assert.equal(wf.match('remove the best ones from Family'), undefined);
  });

  it('returns undefined for "remove my recent trip photos from Family" (recent-trip source)', () => {
    assert.equal(wf.match('remove my recent trip photos from Family'), undefined);
  });

  it('returns undefined for "how many photos are in Family?" (no remove/take verb)', () => {
    assert.equal(wf.match('how many photos are in Family?'), undefined);
  });

  it('returns undefined for empty string', () => {
    assert.equal(wf.match(''), undefined);
  });
});

describe('remove_photos_from_album workflow — parseSlots()', () => {
  it('normalizes album ref (strips article + trailing "album" noun)', () => {
    assert.deepEqual(wf.parseSlots({ albumRef: 'the Family album', sourceDescription: 'my newest 20 photos' }), {
      albumRef: 'Family',
      sourceDescription: 'my newest 20 photos',
    });
  });

  it('returns null when albumRef is empty', () => {
    assert.equal(wf.parseSlots({ albumRef: '', sourceDescription: 'newest 10' }), null);
  });

  it('returns null when sourceDescription is empty', () => {
    assert.equal(wf.parseSlots({ albumRef: 'Family', sourceDescription: '' }), null);
  });

  it('strips trailing punctuation from sourceDescription', () => {
    assert.deepEqual(wf.parseSlots({ albumRef: 'Family', sourceDescription: 'my newest 20 photos.' }), {
      albumRef: 'Family',
      sourceDescription: 'my newest 20 photos',
    });
  });
});
