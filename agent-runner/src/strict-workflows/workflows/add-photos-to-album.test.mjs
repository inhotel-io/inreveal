import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addPhotosToAlbumWorkflow } from './add-photos-to-album.mjs';

const wf = addPhotosToAlbumWorkflow();

// Contract-faithful fake client: it enforces the SAME shape constraints the real
// server tools enforce, so a call the real server would reject also throws here.
// (The previous fixture ignored args, which hid that the workflow sent a
// free-text `query` to tools that don't accept one — add never planned live.)
//   - resolveAssetSearchFilters is a strictObject with NO `query` field.
//   - searchAssets metadata mode rejects `query`; `detail` is a fixed enum.
const fakeClient = ({ albums = [{ id: 'alb-1', albumName: 'Family' }], handleAssetCount = 20, planResult } = {}) => {
  const calls = [];
  return {
    calls,
    async call(name, args) {
      calls.push({ name, args });
      if (name === 'listAlbums') {
        return { albums };
      }
      if (name === 'resolveAssetSearchFilters') {
        if (args && 'query' in args) {
          throw new Error("resolveAssetSearchFilters: Unrecognized key(s) in object: 'query'");
        }
        return { resolvedFilters: {} };
      }
      if (name === 'searchAssets') {
        const mode = args.mode ?? 'metadata';
        if (mode === 'metadata' && args.query !== undefined) {
          throw new Error('searchAssets: query is only supported for smart/description/ocr/filename modes');
        }
        if (args.detail !== undefined && !['ids', 'handle', 'summary', 'metadata'].includes(args.detail)) {
          throw new Error(`searchAssets: invalid detail "${args.detail}"`);
        }
        return { selectionHandle: { id: 'handle-1', assetCount: handleAssetCount } };
      }
      if (name === 'proposeAlbumOperations') {
        return planResult ?? { status: 'success', plan: { id: 'plan-1' } };
      }
      throw new Error(`unexpected ${name}`);
    },
  };
};

describe('add_photos_to_album HybridWorkflow', () => {
  it('resolves a recency source via a metadata search and proposes a duplicate-safe add', async () => {
    const client = fakeClient();
    const outcome = await wf.run({ client, slots: { albumRef: 'Family', sourceDescription: 'my newest 20 photos' } });
    assert.equal(outcome.status, 'planned');

    // Never sends a free-text query to the named-entity resolver (the live bug).
    assert.equal(
      client.calls.some((c) => c.name === 'resolveAssetSearchFilters'),
      false,
    );
    // Resolves recency through a bounded metadata search: newest-first, capped to N, no query.
    const search = client.calls.find((c) => c.name === 'searchAssets');
    assert.ok(search, 'expected a searchAssets call');
    assert.equal(search.args.mode, 'metadata');
    assert.equal(search.args.order, 'desc');
    assert.equal(search.args.limit, 20);
    assert.equal(search.args.query, undefined);

    const ops = client.calls.find((c) => c.name === 'proposeAlbumOperations').args.operations;
    assert.equal(ops[0].type, 'album.addAssets');
    assert.equal(ops[0].assetSource.kind, 'selectionHandle');
    assert.equal(ops[0].assetSource.selectionHandleId, 'handle-1');
    assert.equal(JSON.stringify(client.calls).includes('assetIds'), false); // no raw ids to the model
  });

  it('caps the recency limit and parses varied phrasings', async () => {
    for (const [sourceDescription, expected] of [
      ['stick my 50 most recent photos', 50],
      ['add the last 10 pics', 10],
      ['latest 5 shots', 5],
      ['newest 5000 photos', 1000], // clamped to MAX_RECENCY_LIMIT
    ]) {
      const client = fakeClient();
      const outcome = await wf.run({ client, slots: { albumRef: 'Family', sourceDescription } });
      assert.equal(outcome.status, 'planned', sourceDescription);
      assert.equal(client.calls.find((c) => c.name === 'searchAssets').args.limit, expected, sourceDescription);
    }
  });

  it('hands off non-recency metadata sources (date/location) to open orchestration', async () => {
    for (const sourceDescription of ['my Berlin photos from last weekend', 'the photos I took yesterday', 'newest pics']) {
      const client = fakeClient();
      const outcome = await wf.run({ client, slots: { albumRef: 'Family', sourceDescription } });
      assert.equal(outcome.status, 'handoff_open', sourceDescription);
      // No search, no plan — the strict path never guesses a metadata search here.
      assert.equal(
        client.calls.some((c) => c.name === 'searchAssets' || c.name === 'proposeAlbumOperations'),
        false,
        sourceDescription,
      );
    }
  });

  it('hands off a subjective source', async () => {
    const client = fakeClient();
    const outcome = await wf.run({ client, slots: { albumRef: 'Family', sourceDescription: 'the good ones' } });
    assert.equal(outcome.status, 'handoff_open');
    assert.equal(
      client.calls.some((c) => c.name === 'proposeAlbumOperations'),
      false,
    );
  });

  it('asks for input when the album cannot be resolved', async () => {
    const outcome = await wf.run({
      client: fakeClient({ albums: [] }),
      slots: { albumRef: 'Nope', sourceDescription: 'newest 10' },
    });
    assert.equal(outcome.status, 'needs_input');
  });

  it('asks for input when the recency source resolves to zero assets instead of planning an empty add', async () => {
    const client = fakeClient({ handleAssetCount: 0 });
    const outcome = await wf.run({ client, slots: { albumRef: 'Family', sourceDescription: 'newest 10 photos' } });
    assert.equal(outcome.status, 'needs_input');
    assert.equal(
      client.calls.some((c) => c.name === 'proposeAlbumOperations'),
      false,
    );
  });
});
