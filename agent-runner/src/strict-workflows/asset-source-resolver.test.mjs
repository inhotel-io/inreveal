import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isCleanSource, parseDateRange, parseEntitySource, parseMediaType, resolveAssetSource } from './asset-source-resolver.mjs';
import { makeContractClient } from './workflows/contract-fixtures.mjs';

// A Friday, for deterministic relative-date math.
const NOW = new Date('2026-05-15T12:00:00.000Z');
const iso = (range) => (range ? { after: range.takenAfter.toISOString(), before: range.takenBefore.toISOString() } : range);

describe('parseDateRange', () => {
  for (const [phrase, after, before] of [
    ['photos from 2024', '2024-01-01T00:00:00.000Z', '2024-12-31T23:59:59.999Z'],
    ['in May 2024', '2024-05-01T00:00:00.000Z', '2024-05-31T23:59:59.999Z'],
    ['yesterday', '2026-05-14T00:00:00.000Z', '2026-05-14T23:59:59.999Z'],
    ['this month', '2026-05-01T00:00:00.000Z', '2026-05-31T23:59:59.999Z'],
    ['last month', '2026-04-01T00:00:00.000Z', '2026-04-30T23:59:59.999Z'],
    ['last week', '2026-05-04T00:00:00.000Z', '2026-05-10T23:59:59.999Z'],
    ['last weekend', '2026-05-09T00:00:00.000Z', '2026-05-10T23:59:59.999Z'],
  ]) {
    it(`parses "${phrase}"`, () => {
      assert.deepEqual(iso(parseDateRange(phrase, NOW)), { after, before });
    });
  }

  it('returns undefined for unparseable or date-less phrases', () => {
    assert.equal(parseDateRange('sometime recently', NOW), undefined);
    assert.equal(parseDateRange('my newest 20 photos', NOW), undefined);
    assert.equal(parseDateRange('newest 20', NOW), undefined); // "20" is not a year
  });
});

describe('parseMediaType', () => {
  for (const [phrase, type] of [
    ['my videos from 2024', 'VIDEO'],
    ['newest 10 clips', 'VIDEO'],
    ['my movies', 'VIDEO'],
    ['newest 20 images', 'IMAGE'],
    ['my newest 20 photos', undefined], // generic colloquial word — NOT a type
    ['my pics from 2024', undefined], // generic
    ['screenshots', undefined], // not a metadata type
  ]) {
    it(`maps "${phrase}" → ${type}`, () => {
      assert.equal(parseMediaType(phrase), type);
    });
  }
});

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

  it('hands off an unbounded or qualified source (clean-source gate)', async () => {
    for (const source of [
      'newest photos', // recency keyword but no count → clean yet unbounded
      'my photos', // all filler, no recency/date bound
      'Berlin photos from last weekend', // location residual qualifies the source
      'newest 20 Berlin photos', // recency + location residual → must NOT resolve newest-20-globally
      'photos of Alex from last week', // person residual
    ]) {
      const result = await resolveAssetSource({ client: makeContractClient(), sourceDescription: source, now: NOW });
      assert.equal(result.status, 'handoff', source);
    }
  });

  it('resolves a clean date source into a metadata search with ISO date filters', async () => {
    const client = makeContractClient({ handleAssetCount: 5 });
    const result = await resolveAssetSource({ client, sourceDescription: 'my photos from 2024', now: NOW });
    assert.equal(result.status, 'resolved');
    const search = client.calls.find((c) => c.name === 'searchAssets');
    assert.deepEqual(search.args, {
      mode: 'metadata',
      order: 'desc',
      limit: 1000,
      filters: { takenAfter: '2024-01-01T00:00:00.000Z', takenBefore: '2024-12-31T23:59:59.999Z' },
      detail: 'handle',
    });
  });

  it('combines recency and date (limit + filters)', async () => {
    const client = makeContractClient();
    await resolveAssetSource({ client, sourceDescription: 'newest 20 photos from 2024', now: NOW });
    const search = client.calls.find((c) => c.name === 'searchAssets');
    assert.equal(search.args.limit, 20);
    assert.deepEqual(search.args.filters, {
      takenAfter: '2024-01-01T00:00:00.000Z',
      takenBefore: '2024-12-31T23:59:59.999Z',
    });
  });

  it('resolves a media-type source combined with a date (type + date filters)', async () => {
    const client = makeContractClient();
    const result = await resolveAssetSource({ client, sourceDescription: 'my videos from last weekend', now: NOW });
    assert.equal(result.status, 'resolved');
    const search = client.calls.find((c) => c.name === 'searchAssets');
    assert.equal(search.args.limit, 1000); // no recency count → high cap
    assert.deepEqual(search.args.filters, {
      takenAfter: '2026-05-09T00:00:00.000Z',
      takenBefore: '2026-05-10T23:59:59.999Z',
      type: 'VIDEO',
    });
  });

  it('resolves an image-type source combined with recency (type filter only)', async () => {
    const client = makeContractClient();
    await resolveAssetSource({ client, sourceDescription: 'newest 20 images', now: NOW });
    const search = client.calls.find((c) => c.name === 'searchAssets');
    assert.deepEqual(search.args, {
      mode: 'metadata',
      order: 'desc',
      limit: 20,
      filters: { type: 'IMAGE' },
      detail: 'handle',
    });
  });

  it('combines recency + date + type', async () => {
    const client = makeContractClient();
    await resolveAssetSource({ client, sourceDescription: 'newest 20 videos from 2024', now: NOW });
    const search = client.calls.find((c) => c.name === 'searchAssets');
    assert.equal(search.args.limit, 20);
    assert.deepEqual(search.args.filters, {
      takenAfter: '2024-01-01T00:00:00.000Z',
      takenBefore: '2024-12-31T23:59:59.999Z',
      type: 'VIDEO',
    });
  });

  it('keeps generic "photos" recency-only sources type-free (no filters key — regression guard)', async () => {
    const client = makeContractClient();
    await resolveAssetSource({ client, sourceDescription: 'my newest 20 photos', now: NOW });
    const search = client.calls.find((c) => c.name === 'searchAssets');
    assert.deepEqual(search.args, { mode: 'metadata', order: 'desc', limit: 20, detail: 'handle' });
  });

  it('hands off a type-only source (unbounded — type is not a bound)', async () => {
    const client = makeContractClient();
    const result = await resolveAssetSource({ client, sourceDescription: 'my videos', now: NOW });
    assert.equal(result.status, 'handoff');
    assert.equal(
      client.calls.some((c) => c.name === 'searchAssets'),
      false,
    );
  });

  it('hands off a non-type media noun ("screenshots")', async () => {
    const client = makeContractClient();
    const result = await resolveAssetSource({ client, sourceDescription: 'my screenshots', now: NOW });
    assert.equal(result.status, 'handoff');
    assert.equal(
      client.calls.some((c) => c.name === 'searchAssets'),
      false,
    );
  });

  it('resolves a relative-date source ("photos I took yesterday")', async () => {
    const client = makeContractClient();
    const result = await resolveAssetSource({ client, sourceDescription: 'the photos I took yesterday', now: NOW });
    assert.equal(result.status, 'resolved');
    const search = client.calls.find((c) => c.name === 'searchAssets');
    assert.deepEqual(search.args.filters, {
      takenAfter: '2026-05-14T00:00:00.000Z',
      takenBefore: '2026-05-14T23:59:59.999Z',
    });
  });

  it('keeps recency-only calls unchanged (no filters key)', async () => {
    const client = makeContractClient();
    await resolveAssetSource({ client, sourceDescription: 'my newest 20 photos', now: NOW });
    const search = client.calls.find((c) => c.name === 'searchAssets');
    assert.deepEqual(search.args, { mode: 'metadata', order: 'desc', limit: 20, detail: 'handle' });
  });

  it('hands off an absurd recency count (> 4 digits is not a count → unbounded)', async () => {
    const client = makeContractClient();
    const result = await resolveAssetSource({ client, sourceDescription: 'newest 99999 photos', now: NOW });
    assert.equal(result.status, 'handoff');
    assert.equal(
      client.calls.some((c) => c.name === 'searchAssets'),
      false,
    );
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

  it('hands off "the best Berlin photos" (subjective beats entity, no search)', async () => {
    const client = makeContractClient();
    const result = await resolveAssetSource({ client, sourceDescription: 'the best Berlin photos', now: NOW });
    assert.equal(result.status, 'handoff');
    assert.equal(
      client.calls.some((c) => c.name === 'searchAssets'),
      false,
    );
  });
});

describe('parseEntitySource', () => {
  for (const [input, expected] of [
    ['photos of Alex', { people: ['Alex'] }],
    ['my Berlin photos', { directFilters: { city: 'Berlin' } }],
    ['photos from Paris', { directFilters: { city: 'Paris' } }],
    ['photos tagged Travel', { tags: ['Travel'] }],
    ['my Travel-tagged photos', { tags: ['Travel'] }],
    ['photos in the Italy album', { albums: ['Italy'] }],
    ['my Sony photos', { cameras: ['Sony'] }],
    ['shot on Canon', { cameras: ['Canon'] }],
    ['my 5-star photos', { directFilters: { rating: 5 } }],
    ['rated 5', { directFilters: { rating: 5 } }],
    ['my favorites', { directFilters: { isFavorite: true } }],
    ['my favorite photos', { directFilters: { isFavorite: true } }],
    ['my archived photos', { directFilters: { visibility: 'archive' } }],
    ['my newest 20 photos', undefined],
    ['the best ones', undefined],
    ['photos from 2024', undefined],
    ['my videos', undefined],
    ['my photos', undefined],
    ['rated 7', undefined],
    ['my 7-star photos', undefined],
    ['photos of ' + 'A'.repeat(121), undefined],
  ]) {
    it(`parseEntitySource(${JSON.stringify(input)}) → ${JSON.stringify(expected)}`, () => {
      assert.deepEqual(parseEntitySource(input), expected);
    });
  }
});

describe('isCleanSource', () => {
  for (const [input, expected] of [
    ['my Berlin photos', true],
    ['my Sony photos', true],
    ['photos tagged Travel', true],
    ['photos in the Italy album', true],
    ['my 5-star photos', true],
    ['my archived photos', true],
    ['my newest 20 photos', true],
    ['the best ones', false],
    ['the best Berlin photos', false],
    ['my screenshots', false],
  ]) {
    it(`isCleanSource(${JSON.stringify(input)}) → ${expected}`, () => {
      assert.equal(isCleanSource(input), expected);
    });
  }
});
