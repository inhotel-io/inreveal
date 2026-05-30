import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addPhotosToAlbumWorkflow } from './add-photos-to-album.mjs';

const wf = addPhotosToAlbumWorkflow();

// add_photos needs its own fake client (separate test file): it exercises the
// full bounded read chain, not just listAlbums + proposeAlbumOperations.
const fakeClient = ({ albums = [{ id: 'alb-1', albumName: 'Family' }], handleAssetCount = 20, planResult } = {}) => {
  const calls = [];
  return {
    calls,
    async call(name, args) {
      calls.push({ name, args });
      if (name === 'listAlbums') return { albums };
      if (name === 'resolveAssetSearchFilters') return { filters: { order: 'desc', limit: 20 } };
      if (name === 'searchAssets') return { selectionHandle: { id: 'handle-1', assetCount: handleAssetCount } };
      if (name === 'proposeAlbumOperations') return planResult ?? { status: 'success', plan: { id: 'plan-1' } };
      throw new Error(`unexpected ${name}`);
    },
  };
};

describe('add_photos_to_album HybridWorkflow', () => {
  it('resolves album + source into a selection handle and proposes a duplicate-safe add', async () => {
    const client = fakeClient();
    const outcome = await wf.run({ client, slots: { albumRef: 'Family', sourceDescription: 'my newest 20 photos' } });
    assert.equal(outcome.status, 'planned');
    const ops = client.calls.find((c) => c.name === 'proposeAlbumOperations').args.operations;
    assert.equal(ops[0].type, 'album.addAssets');
    assert.equal(ops[0].assetSource.kind, 'selectionHandle');
    assert.equal(ops[0].assetSource.selectionHandleId, 'handle-1');
    assert.equal(JSON.stringify(client.calls).includes('assetIds'), false); // no raw ids to the model
  });

  it('hands off to open orchestration for a subjective source', async () => {
    const client = fakeClient();
    const outcome = await wf.run({ client, slots: { albumRef: 'Family', sourceDescription: 'the good ones' } });
    assert.equal(outcome.status, 'handoff_open');
    assert.equal(
      client.calls.some((c) => c.name === 'proposeAlbumOperations'),
      false,
    ); // no plan on handoff
  });

  it('asks for input when the album cannot be resolved', async () => {
    const outcome = await wf.run({
      client: fakeClient({ albums: [] }),
      slots: { albumRef: 'Nope', sourceDescription: 'newest 10' },
    });
    assert.equal(outcome.status, 'needs_input');
  });

  it('asks for input when the resolved source has zero assets instead of planning an empty add', async () => {
    const client = fakeClient({ handleAssetCount: 0 });
    const outcome = await wf.run({ client, slots: { albumRef: 'Family', sourceDescription: 'photos from 1990' } });
    assert.equal(outcome.status, 'needs_input');
    assert.equal(
      client.calls.some((c) => c.name === 'proposeAlbumOperations'),
      false,
    ); // never plans an empty source
  });
});
