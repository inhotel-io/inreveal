import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveAssetSource } from './asset-source-resolver.mjs';
import { makeContractClient } from './workflows/contract-fixtures.mjs';

describe('resolveAssetSource', () => {
  it('resolves a recency source via a bounded metadata search (no query)', async () => {
    const client = makeContractClient({ handleAssetCount: 13 });
    const result = await resolveAssetSource({ client, sourceDescription: 'my newest 20 photos' });
    assert.equal(result.status, 'resolved');
    assert.equal(result.selectionHandleId, 'handle-1');
    assert.equal(result.assetCount, 13);
    const search = client.calls.find((c) => c.name === 'searchAssets');
    assert.deepEqual(search.args, { mode: 'metadata', order: 'desc', limit: 20, detail: 'handle' });
    assert.equal(search.args.query, undefined);
  });

  it('hands off a subjective source without searching', async () => {
    const client = makeContractClient();
    const result = await resolveAssetSource({ client, sourceDescription: 'the good ones' });
    assert.equal(result.status, 'handoff');
    assert.equal(
      client.calls.some((c) => c.name === 'searchAssets'),
      false,
    );
  });

  it('hands off a non-recency source (no count / date / location) for now', async () => {
    for (const source of ['Berlin photos from last weekend', 'newest photos', 'photos I took yesterday']) {
      const result = await resolveAssetSource({ client: makeContractClient(), sourceDescription: source });
      assert.equal(result.status, 'handoff', source);
    }
  });

  it('reports empty when the recency source resolves to zero assets', async () => {
    const client = makeContractClient({ handleAssetCount: 0 });
    const result = await resolveAssetSource({ client, sourceDescription: 'newest 10 photos' });
    assert.equal(result.status, 'empty');
  });

  it('propagates a search tool error (caller maps it to failed)', async () => {
    const throwingClient = {
      calls: [],
      async call(name) {
        if (name === 'searchAssets') throw new Error('boom');
        throw new Error(`unexpected ${name}`);
      },
    };
    await assert.rejects(
      () => resolveAssetSource({ client: throwingClient, sourceDescription: 'newest 5 photos' }),
      /boom/,
    );
  });
});
