import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { KNOWN_BATCH_ACTION_TYPES, KNOWN_OPERATION_TYPES, makeContractClient } from './contract-fixtures.mjs';

const newUuid = () => '00000000-0000-4000-8000-000000000001';

describe('makeContractClient — contract-faithful fake MCP client', () => {
  it('resolveAssetSearchFilters rejects a free-text query (strictObject has no query field)', async () => {
    const client = makeContractClient();
    await assert.rejects(() => client.call('resolveAssetSearchFilters', { query: 'newest 20' }), /query/i);
    assert.deepEqual(await client.call('resolveAssetSearchFilters', { people: ['Alex'] }), { resolvedFilters: {} });
  });

  it('searchAssets rejects query in metadata mode but accepts it in smart mode', async () => {
    const client = makeContractClient();
    await assert.rejects(() => client.call('searchAssets', { query: 'beach' }), /metadata/i); // default mode
    await assert.rejects(() => client.call('searchAssets', { mode: 'metadata', query: 'beach' }), /metadata/i);
    const smart = await client.call('searchAssets', { mode: 'smart', query: 'beach', detail: 'handle' });
    assert.equal(smart.selectionHandle.id, 'handle-1');
  });

  it('searchAssets returns a selection handle for a metadata recency search', async () => {
    const client = makeContractClient({ handleAssetCount: 7 });
    const res = await client.call('searchAssets', { mode: 'metadata', order: 'desc', limit: 20, detail: 'handle' });
    assert.equal(res.selectionHandle.id, 'handle-1');
    assert.equal(res.selectionHandle.assetCount, 7);
  });

  it('searchAssets rejects an out-of-enum detail', async () => {
    const client = makeContractClient();
    await assert.rejects(() => client.call('searchAssets', { detail: 'bogus' }), /detail/i);
  });

  it('proposeAssetBatchFromSelection accepts each valid action', async () => {
    const client = makeContractClient();
    for (const action of [
      { type: 'asset.setArchive', archived: true },
      { type: 'asset.setFavorite', favorite: false },
      { type: 'asset.addTag', tagName: 'Travel' },
      { type: 'asset.addTag', tagId: newUuid() },
    ]) {
      const res = await client.call('proposeAssetBatchFromSelection', { action, selectionHandleId: 'h' });
      assert.equal(res.plan.id, 'plan-1');
    }
  });

  it('proposeAssetBatchFromSelection enforces the action shape', async () => {
    const client = makeContractClient();
    // addTag: exactly one of tagName/tagId
    await assert.rejects(
      () => client.call('proposeAssetBatchFromSelection', { action: { type: 'asset.addTag' }, selectionHandleId: 'h' }),
      /tagName|tagId/i,
    );
    await assert.rejects(
      () =>
        client.call('proposeAssetBatchFromSelection', {
          action: { type: 'asset.addTag', tagName: 'T', tagId: newUuid() },
          selectionHandleId: 'h',
        }),
      /tagName|tagId/i,
    );
    // unknown action type
    await assert.rejects(
      () => client.call('proposeAssetBatchFromSelection', { action: { type: 'asset.bogus' }, selectionHandleId: 'h' }),
      /action/i,
    );
    // missing selection handle
    await assert.rejects(
      () => client.call('proposeAssetBatchFromSelection', { action: { type: 'asset.setArchive', archived: true } }),
      /selectionHandle/i,
    );
  });

  it('proposeAlbumOperations accepts album and space ops but rejects unknown types', async () => {
    const client = makeContractClient();
    const ok = await client.call('proposeAlbumOperations', {
      summary: 's',
      operations: [
        { type: 'album.addAssets', targetKind: 'existing_album', targetId: 'a', assetSource: { kind: 'selectionHandle', selectionHandleId: 'h' } },
        { type: 'space.updateDetails', targetId: 'spc-1', payload: { name: 'X' } },
      ],
    });
    assert.equal(ok.plan.id, 'plan-1');
    await assert.rejects(
      () => client.call('proposeAlbumOperations', { summary: 's', operations: [{ type: 'bogus.op' }] }),
      /operation type/i,
    );
  });

  it('proposeAlbumFromSelection requires albumName + selectionHandleId', async () => {
    const client = makeContractClient();
    const ok = await client.call('proposeAlbumFromSelection', { albumName: 'A', selectionHandleId: 'h' });
    assert.equal(ok.plan.id, 'plan-1');
    await assert.rejects(() => client.call('proposeAlbumFromSelection', { selectionHandleId: 'h' }), /albumName/i);
    await assert.rejects(() => client.call('proposeAlbumFromSelection', { albumName: 'A' }), /selectionHandle/i);
  });

  it('readSpace returns members for a known id and throws for an unknown id', async () => {
    const client = makeContractClient({
      spaces: [{ id: 'spc-1', name: 'Family', members: [{ userId: 'u1', name: 'Owner', role: 'owner' }] }],
    });
    const space = await client.call('readSpace', { spaceId: 'spc-1' });
    assert.equal(space.members[0].role, 'owner');
    await assert.rejects(() => client.call('readSpace', { spaceId: 'nope' }), /not found/i);
  });

  it('listSpaces hides member detail; searchUsers returns users; calls are recorded in order', async () => {
    const client = makeContractClient({
      spaces: [{ id: 'spc-1', name: 'Family', members: [{ userId: 'u1', name: 'Owner', role: 'owner' }] }],
      users: [{ id: 'usr-1', name: 'Alex', email: 'alex@example.com' }],
    });
    const list = await client.call('listSpaces', {});
    assert.equal(list.spaces[0].name, 'Family');
    assert.equal(list.spaces[0].members, undefined);
    const users = await client.call('searchUsers', { query: 'Alex' });
    assert.equal(users.users[0].name, 'Alex');
    assert.deepEqual(
      client.calls.map((c) => c.name),
      ['listSpaces', 'searchUsers'],
    );
  });

  it('rejects an unexpected tool name', async () => {
    const client = makeContractClient();
    await assert.rejects(() => client.call('teleport', {}), /unexpected/i);
  });

  it('exports the known-type sets used by the validators', () => {
    assert.ok(KNOWN_OPERATION_TYPES.has('space.updateMemberRole'));
    assert.ok(KNOWN_OPERATION_TYPES.has('album.create'));
    assert.ok(KNOWN_BATCH_ACTION_TYPES.has('asset.addTag'));
  });
});
