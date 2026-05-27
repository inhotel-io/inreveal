import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createE2eRuntime } from './e2e-runtime.mjs';

const gallerySessionId = '00000000-0000-4000-8000-000000000100';
const runnerSessionId = `e2e-${gallerySessionId}`;
const token = 'gateway-token-secret';
const gateway = { url: 'http://gallery.example.test/api/agent/mcp/sessions/00000000-0000-4000-8000-000000000100', token };
const lastWeekendHighlightFilters = {
  takenAfter: '2026-05-23T00:00:00.000Z',
  takenBefore: '2026-05-24T23:59:59.999Z',
};
const usaTripSearchHandleId = '00000000-0000-4000-8000-000000000901';
const usaTripCuratedHandleId = '00000000-0000-4000-8000-000000000902';
const highlightAssetIds = [
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000402',
  '00000000-0000-4000-8000-000000000403',
  '00000000-0000-4000-8000-000000000404',
];
const familyAlbumId = '00000000-0000-4000-8000-000000000501';
const familyOwnerId = '00000000-0000-4000-8000-000000000601';

const highlightMetadataAsset = (id, overrides = {}) => ({
  id,
  type: 'IMAGE',
  localDateTime: '2026-05-23T12:00:00.000Z',
  originalFileName: `${id.slice(-4)}.jpg`,
  isFavorite: false,
  exifInfo: { rating: 0, city: 'Porto', country: 'Portugal' },
  tags: [{ id: '00000000-0000-4000-8000-000000000701', value: 'Trip', color: 'blue' }],
  ...overrides,
});

const defaultHighlightMetadataAssets = () => [
  highlightMetadataAsset(highlightAssetIds[0], { exifInfo: { rating: 3, city: 'Porto', country: 'Portugal' } }),
  highlightMetadataAsset(highlightAssetIds[1], {
    isFavorite: true,
    exifInfo: { rating: 1, city: 'Porto', country: 'Portugal' },
  }),
  highlightMetadataAsset(highlightAssetIds[2], { exifInfo: { rating: 5, city: 'Lisbon', country: 'Portugal' } }),
  highlightMetadataAsset(highlightAssetIds[3], { exifInfo: { rating: 2, city: 'Lisbon', country: 'Portugal' } }),
];

const currentAlbumAssetIds = Array.from(
  { length: 8 },
  (_value, index) => `00000000-0000-4000-8000-${String(800 + index).padStart(12, '0')}`,
);

const currentAlbumMetadataAssets = () =>
  currentAlbumAssetIds.map((id, index) =>
    highlightMetadataAsset(id, {
      isFavorite: index === 1 || index === 4,
      exifInfo: {
        rating: [1, 5, 3, 2, 4, 0, 2, 1][index],
        city: index % 2 === 0 ? 'Porto' : 'Lisbon',
        country: 'Portugal',
      },
    }),
  );

const currentAlbumSessionContext = () => ({
  albumId: familyAlbumId,
});

const familyAlbumSummary = () => ({
  id: familyAlbumId,
  albumName: 'Family',
  description: 'Family album',
  ownerId: familyOwnerId,
  assetCount: 1,
  startDate: '2026-05-20T00:00:00.000Z',
  endDate: '2026-05-25T00:00:00.000Z',
  albumThumbnailAssetId: null,
});

const createSessionBody = (overrides = {}) => ({
  gallerySessionId,
  credential: {
    id: '00000000-0000-4000-8000-000000000001',
    providerType: 'openai-compatible',
    label: 'E2E runner',
    baseUrl: 'http://provider.invalid/v1',
    models: ['e2e-album-organizer'],
    defaultModel: 'e2e-album-organizer',
    secret: 'e2e-secret',
  },
  model: 'e2e-album-organizer',
  permissionPreset: 'careful',
  permissionPlan: {},
  approvalMode: 'plan-only',
  initialContext: {},
  mcpGateway: gateway,
  ...overrides,
});

const messageBody = (text) => ({
  runnerSessionId,
  gallerySessionId,
  messageId: '00000000-0000-4000-8000-000000000200',
  content: { blocks: [{ type: 'text', text }] },
});

const collectEvents = async (runtime, text) => {
  const events = [];
  for await (const event of runtime.sendMessage(messageBody(text))) {
    events.push(event);
  }
  return events;
};

const createFetch = (handlers) => {
  const calls = [];
  const fetchImplementation = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : {};
    const path = new URL(String(url)).pathname;
    calls.push({ url: String(url), path, body, authorization: init?.headers?.Authorization });

    const handler = handlers.find((candidate) => body?.params?.name === candidate.name);
    if (!handler) {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: body.id,
          error: { code: -32601, message: `unexpected tool ${body?.params?.name}` },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const result = await handler.handle(body.params?.arguments ?? {}, body);
    return new Response(JSON.stringify(result.body), {
      status: result.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  return { calls, fetchImplementation };
};

const successHandlers = () => [
  {
    name: 'searchAssets',
    handle: (args, request) => ({
      body: {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          structuredContent: {
            status: 'success',
            assets: [
              { id: '00000000-0000-4000-8000-000000000201' },
              { id: '00000000-0000-4000-8000-000000000202' },
              { id: '00000000-0000-4000-8000-000000000203' },
            ],
            selectionHandle: args.createSelectionHandle
              ? {
                  id: '00000000-0000-4000-8000-000000000333',
                  sourceRef: 'asset-source:search:00000000-0000-4000-8000-000000000333',
                  assetCount: 3,
                  sampleAssetIds: [
                    '00000000-0000-4000-8000-000000000201',
                    '00000000-0000-4000-8000-000000000202',
                  ],
                }
              : undefined,
          },
        },
      },
    }),
  },
  {
    name: 'proposeAlbumOperations',
    handle: (args, request) => ({
      body: {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                status: 'success',
                summary: 'Stored 3 proposed operations.',
                plan: { id: '00000000-0000-4000-8000-000000000301' },
                toolCall: null,
                received: args,
              }),
            },
          ],
        },
      },
    }),
  },
  {
    name: 'proposeAssetBatchFromSearch',
    handle: (args, request) => ({
      body: {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          structuredContent: {
            status: 'success',
            summary: 'Stored 1 proposed metadata operation.',
            plan: { id: '00000000-0000-4000-8000-000000000302' },
            received: args,
          },
        },
      },
    }),
  },
];

const metadataHighlightHandlers = ({
  assetIds = highlightAssetIds,
  metadataAssets = defaultHighlightMetadataAssets(),
  totalCount,
  albums = [],
  albumAssetIds = [],
  searchHandleId = '00000000-0000-4000-8000-000000000901',
  curatedHandleId = '00000000-0000-4000-8000-000000000902',
  curatedCount,
} = {}) => [
  {
    name: 'searchAssets',
    handle: (args, request) => {
      const returnedAssetIds = assetIds.slice(0, args.limit ?? assetIds.length);
      if (args.detail === 'handle') {
        return {
          body: {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              structuredContent: {
                status: 'success',
                summary: `Returned ${returnedAssetIds.length} highlight candidate(s).`,
                detail: 'handle',
                selectionHandle: {
                  id: searchHandleId,
                  assetCount: totalCount ?? assetIds.length,
                },
                returnedCount: returnedAssetIds.length,
                hasMore: assetIds.length > returnedAssetIds.length,
                nextPage: assetIds.length > returnedAssetIds.length ? '2' : null,
                resultSize: returnedAssetIds.length,
                ...(totalCount === undefined ? {} : { totalCount }),
              },
            },
          },
        };
      }

      return {
        body: {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            structuredContent: {
              summary: `Returned ${returnedAssetIds.length} highlight candidate(s).`,
              detail: 'ids',
              assetIds: returnedAssetIds,
              returnedCount: returnedAssetIds.length,
              hasMore: assetIds.length > returnedAssetIds.length,
              nextPage: assetIds.length > returnedAssetIds.length ? '2' : null,
              ...(totalCount === undefined ? {} : { totalCount }),
            },
          },
        },
      };
    },
  },
  {
    name: 'readAssetMetadata',
    handle: (args, request) => ({
      body: {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          structuredContent: {
            summary: `Returned metadata for ${args.assetIds.length} asset(s).`,
            fields: args.fields,
            assets: args.assetIds.map((id) => metadataAssets.find((asset) => asset.id === id)).filter(Boolean),
          },
        },
      },
    }),
  },
  {
    name: 'curateSelection',
    handle: (args, request) => ({
      body: {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          structuredContent: {
            status: 'success',
            summary: `Curated ${curatedCount ?? args.targetCount} highlight(s).`,
            selectionHandle: {
              id: curatedHandleId,
              assetCount: curatedCount ?? args.targetCount,
            },
            selectedAssetCount: curatedCount ?? args.targetCount,
            sourceAssetCount: assetIds.length,
            criteriaSummary: args.criteria,
          },
        },
      },
    }),
  },
  {
    name: 'proposeAlbumFromSelection',
    handle: (args, request) => ({
      body: {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          structuredContent: {
            status: 'success',
            summary: 'Stored proposed album from selection.',
            plan: { id: '00000000-0000-4000-8000-000000000303' },
            received: args,
          },
        },
      },
    }),
  },
  {
    name: 'proposeAssetBatchFromSelection',
    handle: (args, request) => ({
      body: {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          structuredContent: {
            status: 'success',
            summary: 'Stored proposed asset batch from selection.',
            plan: { id: '00000000-0000-4000-8000-000000000304' },
            received: args,
          },
        },
      },
    }),
  },
  {
    name: 'listAlbums',
    handle: (_args, request) => ({
      body: {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          structuredContent: { albums },
        },
      },
    }),
  },
  {
    name: 'readAlbum',
    handle: (args, request) => {
      const album = albums.find((candidate) => candidate.id === args.albumId);
      return {
        body: {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            structuredContent: {
              album: {
                ...album,
                assetCount: albumAssetIds.length,
                assetIds: albumAssetIds,
              },
            },
          },
        },
      };
    },
  },
  successHandlers()[1],
];

const usaTripHandleFirstHandlers = () => [
  {
    name: 'searchAssets',
    handle: (args, request) => {
      assert.deepEqual(args, {
        filters: {
          country: 'USA',
          takenAfter: '2026-01-01T00:00:00.000Z',
          takenBefore: '2026-02-01T00:00:00.000Z',
        },
        detail: 'handle',
        limit: 1000,
      });
      return {
        body: {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            structuredContent: {
              status: 'success',
              selectionHandle: { id: usaTripSearchHandleId, assetCount: 80 },
              assetCount: 80,
              detail: 'handle',
              returnedCount: 80,
              hasMore: false,
              nextPage: null,
              resultSize: 80,
            },
          },
        },
      };
    },
  },
  {
    name: 'curateSelection',
    handle: (args, request) => {
      assert.deepEqual(args, {
        selectionHandleId: usaTripSearchHandleId,
        targetCount: 15,
        strategy: 'metadata-highlights',
        criteria: 'top highlights from January 2026 USA trip',
        sampleSize: 10,
      });
      return {
        body: {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            structuredContent: {
              status: 'success',
              selectionHandle: { id: usaTripCuratedHandleId, assetCount: 15 },
              selectedAssetCount: 15,
              sourceAssetCount: 80,
              criteriaSummary: 'top highlights from January 2026 USA trip',
            },
          },
        },
      };
    },
  },
  {
    name: 'proposeAlbumFromSelection',
    handle: (args, request) => {
      assert.deepEqual(args, {
        summary: 'Create USA Highlights with 15 metadata-only curated highlights.',
        albumName: 'USA Highlights',
        description: 'Suggested highlights selected from metadata signals. No previews were inspected.',
        selectionHandleId: usaTripCuratedHandleId,
      });
      return {
        body: {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            structuredContent: {
              status: 'success',
              plan: { id: '00000000-0000-4000-8000-000000000305' },
            },
          },
        },
      };
    },
  },
];

const previewReference = (assetId) => ({
  assetId,
  mediaUrl: `/api/assets/${assetId}/thumbnail?size=preview`,
  mimeType: 'image/jpeg',
  fileName: `${assetId}.jpg`,
  width: 1024,
  height: 768,
});

const previewHighlightHandlers = (options = {}) => {
  const handlers = metadataHighlightHandlers(options);
  return [
    handlers[0],
    handlers[1],
    {
      name: 'readAssetPreviews',
      handle: (args, request) => ({
        body: {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            structuredContent: {
              previews: args.assetIds.map(previewReference),
            },
          },
        },
      }),
    },
    handlers.find((handler) => handler.name === 'curateSelection'),
    handlers.find((handler) => handler.name === 'proposeAlbumFromSelection'),
    handlers.find((handler) => handler.name === 'proposeAssetBatchFromSelection'),
    handlers.find((handler) => handler.name === 'listAlbums'),
    handlers.find((handler) => handler.name === 'readAlbum'),
    handlers.find((handler) => handler.name === 'proposeAlbumOperations'),
  ];
};

describe('e2e runtime', () => {
  it('creates a runner session without exposing runner-owned Gallery tool names', async () => {
    const runtime = createE2eRuntime();

    const session = await runtime.createSession(createSessionBody());

    assert.equal(runtime.getCapabilities().runtime, 'e2e');
    assert.deepEqual(runtime.getCapabilities().tools, ['mcp:gallery']);
    assert.equal(session.runnerSessionId, runnerSessionId);
    assert.equal(session.capabilities.protocolVersion, '2026-05-14');
    assert.equal(session.capabilities.streaming, true);
    assert.equal(session.capabilities.models.includes('e2e-album-organizer'), true);
    assert.deepEqual(session.capabilities.tools, ['mcp:gallery']);
    assert.equal(JSON.stringify(session).includes(token), false);
  });

  it('searches visible assets and proposes a deterministic album plan', async () => {
    const { calls, fetchImplementation } = createFetch(successHandlers());
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody());

    const events = await collectEvents(runtime, 'Create a Portugal trip album.');

    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, gateway.url);
    assert.equal(calls[0].body.method, 'tools/call');
    assert.equal(calls[0].body.params.name, 'searchAssets');
    assert.deepEqual(calls[0].body.params.arguments, { filters: { isNotInAlbum: true }, limit: 3 });
    assert.equal(calls[0].authorization, `Bearer ${token}`);
    assert.equal(calls[1].url, gateway.url);
    assert.equal(calls[1].body.method, 'tools/call');
    assert.equal(calls[1].body.params.name, 'proposeAlbumOperations');
    assert.equal(JSON.stringify(calls[0].body).includes(token), false);
    assert.equal(calls[1].body.params.arguments.summary, 'Create Portugal Trip and add 2 loose assets.');
    assert.deepEqual(
      calls[1].body.params.arguments.operations.map((operation) => operation.type),
      ['album.create', 'album.addAssets', 'album.setCover'],
    );
    assert.deepEqual(calls[1].body.params.arguments.operations[1].assetIds, [
      '00000000-0000-4000-8000-000000000201',
      '00000000-0000-4000-8000-000000000202',
    ]);
    assert.deepEqual(calls[1].body.params.arguments.operations[2].assetIds, ['00000000-0000-4000-8000-000000000201']);
    assert.equal(events.at(-1).type, 'assistant-message-completed');
    assert.match(events.at(-1).content.blocks[0].text, /I proposed a Portugal Trip album/);
  });

  it('uses compact asset ids from search when metadata assets are omitted', async () => {
    const { calls, fetchImplementation } = createFetch([
      {
        name: 'searchAssets',
        handle: (_args, request) => ({
          body: {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              structuredContent: {
                status: 'success',
                assetIds: [
                  '00000000-0000-4000-8000-000000000211',
                  '00000000-0000-4000-8000-000000000212',
                  '00000000-0000-4000-8000-000000000213',
                ],
                returnedCount: 3,
                hasMore: false,
              },
            },
          },
        }),
      },
      successHandlers()[1],
    ]);
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody());

    const events = await collectEvents(runtime, 'Create a Portugal trip album.');

    assert.equal(calls.length, 2);
    assert.equal(calls[1].body.params.name, 'proposeAlbumOperations');
    assert.deepEqual(calls[1].body.params.arguments.operations[1].assetIds, [
      '00000000-0000-4000-8000-000000000211',
      '00000000-0000-4000-8000-000000000212',
    ]);
    assert.deepEqual(calls[1].body.params.arguments.operations[2].assetIds, ['00000000-0000-4000-8000-000000000211']);
    assert.equal(events.at(-1).type, 'assistant-message-completed');
    assert.match(events.at(-1).content.blocks[0].text, /I proposed a Portugal Trip album/);
  });

  it('proposes a metadata description plan from a newest-photos prompt', async () => {
    const { calls, fetchImplementation } = createFetch(successHandlers());
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody());

    const events = await collectEvents(runtime, 'Set the description on the 5 newest photos to Test batch.');

    assert.equal(calls.length, 2);
    assert.equal(calls[0].body.params.name, 'searchAssets');
    assert.deepEqual(calls[0].body.params.arguments, {
      filters: {},
      order: 'desc',
      limit: 5,
      detail: 'ids',
      createSelectionHandle: true,
      sampleSize: 2,
    });
    assert.equal(calls[1].body.params.name, 'proposeAssetBatchFromSearch');
    assert.deepEqual(calls[1].body.params.arguments.action, {
      type: 'asset.updateMetadata',
      description: 'Test batch',
    });
    assert.deepEqual(calls[1].body.params.arguments.assetSource, {
      kind: 'previousSearch',
      sourceRef: 'asset-source:search:00000000-0000-4000-8000-000000000333',
    });
    assert.match(events.at(-1).content.blocks[0].text, /metadata/i);
  });

  it('proposes a metadata coordinate plan only when latitude and longitude are present', async () => {
    const { calls, fetchImplementation } = createFetch(successHandlers());
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody());

    const events = await collectEvents(runtime, 'Set these photos to latitude 48.8566 and longitude 2.3522.');

    assert.equal(calls.length, 2);
    assert.equal(calls[1].body.params.name, 'proposeAssetBatchFromSearch');
    assert.deepEqual(calls[1].body.params.arguments.action, {
      type: 'asset.updateMetadata',
      latitude: 48.8566,
      longitude: 2.3522,
    });
    assert.match(events.at(-1).content.blocks[0].text, /coordinates/i);
  });

  it('asks for coordinates instead of planning a place-name metadata edit', async () => {
    const { calls, fetchImplementation } = createFetch(successHandlers());
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody());

    const events = await collectEvents(runtime, 'Set these photos to Paris.');

    assert.equal(calls.length, 0);
    assert.match(events.at(-1).content.blocks[0].text, /latitude and longitude/i);
  });

  it('asks for longitude instead of planning an incomplete coordinate edit', async () => {
    const { calls, fetchImplementation } = createFetch(successHandlers());
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody());

    const events = await collectEvents(runtime, 'Set these photos to latitude 48.8566.');

    assert.equal(calls.length, 0);
    assert.match(events.at(-1).content.blocks[0].text, /longitude/i);
  });

  it('asks for a bounded source before curating best photos from the whole library', async () => {
    const { calls, fetchImplementation } = createFetch(successHandlers());
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody());

    const events = await collectEvents(runtime, 'Pick the best photos from my library.');

    assert.equal(calls.length, 0);
    assert.equal(events.at(-1).type, 'assistant-message-completed');
    assert.match(events.at(-1).content.blocks[0].text, /bounded source/i);
    assert.match(events.at(-1).content.blocks[0].text, /which .*source|which .*set/i);
    assert.match(events.at(-1).content.blocks[0].text, /\?/);
    assert.match(events.at(-1).content.blocks[0].text, /album|shared space|date range|selected photos/i);
  });

  it('proposes a metadata-only highlight album planning through selection handles', async () => {
    const { calls, fetchImplementation } = createFetch(metadataHighlightHandlers());
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody());

    const events = await collectEvents(
      runtime,
      'Pick the best 2 photos from last weekend and make an album called Weekend Highlights.',
    );

    assert.equal(calls.map((call) => call.body.params.name).join(','), 'searchAssets,curateSelection,proposeAlbumFromSelection');
    assert.deepEqual(calls[0].body.params.arguments, {
      filters: lastWeekendHighlightFilters,
      detail: 'handle',
      limit: 1000,
    });
    assert.equal(calls[1].body.params.arguments.selectionHandleId, usaTripSearchHandleId);
    assert.equal(calls[1].body.params.arguments.targetCount, 2);
    const plan = calls[2].body.params.arguments;
    assert.match(plan.summary, /metadata-only/i);
    assert.equal(plan.albumName, 'Weekend Highlights');
    assert.equal(plan.selectionHandleId, usaTripCuratedHandleId);
    assert.equal(JSON.stringify(plan).includes('assetIds'), false);
    assert.match(events.at(-1).content.blocks[0].text, /metadata-only/i);
    assert.match(events.at(-1).content.blocks[0].text, /2 suggested highlights/i);
    assert.match(events.at(-1).content.blocks[0].text, /Review/i);
  });

  it('creates USA trip highlights through search handle, curation handle, and selection plan without raw ids', async () => {
    const { calls, fetchImplementation } = createFetch(usaTripHandleFirstHandlers());
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody());

    const events = await collectEvents(
      runtime,
      'Create an album of the top 15 highlights from my January 2026 USA trip called USA Highlights.',
    );

    assert.equal(calls.map((call) => call.body.params.name).join(','), 'searchAssets,curateSelection,proposeAlbumFromSelection');
    assert.equal(JSON.stringify(calls).includes('assetIds'), false);
    assert.match(events.at(-1).content.blocks[0].text, /metadata-only/i);
    assert.match(events.at(-1).content.blocks[0].text, /15 suggested highlights/i);
    assert.match(events.at(-1).content.blocks[0].text, /Review/i);
  });

  it('reads previews after bounded candidates for preview-assisted highlight album planning', async () => {
    const { calls, fetchImplementation } = createFetch(previewHighlightHandlers());
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody({ initialContext: { providerSupportsImages: true } }));

    const events = await collectEvents(
      runtime,
      'Pick the best 2 photos from last weekend and make an album called Weekend Highlights.',
    );

    assert.equal(
      calls.map((call) => call.body.params.name).join(','),
      'searchAssets,readAssetMetadata,readAssetPreviews,proposeAlbumOperations',
    );
    assert.equal(calls[0].body.params.arguments.limit, 250);
    assert.deepEqual(calls[2].body.params.arguments, { assetIds: highlightAssetIds });
    const plan = calls[3].body.params.arguments;
    assert.match(plan.summary, /preview-assisted/i);
    assert.equal(JSON.stringify(plan).includes('readAssetOriginals'), false);
    assert.equal(JSON.stringify(plan.operations).includes('metadata-only'), false);
    assert.equal(JSON.stringify(plan.operations).includes('No previews were inspected'), false);
    assert.deepEqual(plan.operations[1].assetIds, [
      '00000000-0000-4000-8000-000000000402',
      '00000000-0000-4000-8000-000000000403',
    ]);
    assert.match(events.at(-1).content.blocks[0].text, /preview-assisted/i);
  });

  it('asks to narrow before preview-assisted highlight planning above the preview limit', async () => {
    const oversizedAssetIds = Array.from(
      { length: 251 },
      (_value, index) => `00000000-0000-4000-8000-${String(2000 + index).padStart(12, '0')}`,
    );
    const { calls, fetchImplementation } = createFetch(previewHighlightHandlers({ assetIds: oversizedAssetIds }));
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody({ initialContext: { providerSupportsImages: true } }));

    const events = await collectEvents(
      runtime,
      'Pick the best 2 photos from last weekend and make an album called Weekend Highlights.',
    );

    assert.equal(calls.map((call) => call.body.params.name).join(','), 'searchAssets');
    assert.equal(calls[0].body.params.arguments.limit, 250);
    assert.match(events.at(-1).content.blocks[0].text, /too many/i);
    assert.match(events.at(-1).content.blocks[0].text, /narrow/i);
  });

  it('falls back to metadata-only highlights when preview reads are denied', async () => {
    const handlers = previewHighlightHandlers();
    handlers[2] = {
      name: 'readAssetPreviews',
      handle: (_args, request) => ({
        body: {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            structuredContent: {
              status: 'denied',
              summary: 'Preview reads are denied in this session',
            },
          },
        },
      }),
    };
    const { calls, fetchImplementation } = createFetch(handlers);
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody({ initialContext: { providerSupportsImages: true } }));

    const events = await collectEvents(
      runtime,
      'Pick the best 2 photos from last weekend and make an album called Weekend Highlights.',
    );

    assert.equal(
      calls.map((call) => call.body.params.name).join(','),
      'searchAssets,readAssetMetadata,readAssetPreviews,proposeAlbumOperations',
    );
    assert.match(calls.at(-1).body.params.arguments.summary, /metadata-only/i);
    assert.match(events.at(-1).content.blocks[0].text, /previews were unavailable/i);
  });

  it('keeps provider-without-image-input highlight planning metadata-only without preview reads', async () => {
    const { calls, fetchImplementation } = createFetch(previewHighlightHandlers());
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody({ initialContext: { providerSupportsImages: false } }));

    const events = await collectEvents(
      runtime,
      'Pick the best 2 photos from last weekend and make an album called Weekend Highlights.',
    );

    assert.equal(calls.map((call) => call.body.params.name).join(','), 'searchAssets,curateSelection,proposeAlbumFromSelection');
    assert.match(calls.at(-1).body.params.arguments.summary, /metadata-only/i);
    assert.match(events.at(-1).content.blocks[0].text, /metadata-only/i);
  });

  it('proposes exactly one preview-assisted album cover operation from a named album', async () => {
    const albums = [familyAlbumSummary()];
    const { calls, fetchImplementation } = createFetch(
      previewHighlightHandlers({
        albums,
        albumAssetIds: highlightAssetIds,
      }),
    );
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody({ initialContext: { providerSupportsImages: true } }));

    const events = await collectEvents(runtime, 'Pick a better cover for Family.');

    assert.equal(
      calls.map((call) => call.body.params.name).join(','),
      'listAlbums,readAlbum,readAssetMetadata,readAssetPreviews,proposeAlbumOperations',
    );
    const plan = calls.at(-1).body.params.arguments;
    assert.match(plan.summary, /cover/i);
    assert.match(plan.summary, /preview-assisted/i);
    assert.deepEqual(plan.operations, [
      {
        type: 'album.setCover',
        summary: 'Set Family cover to a suggested highlight.',
        targetKind: 'existing_album',
        targetId: familyAlbumId,
        assetIds: ['00000000-0000-4000-8000-000000000402'],
        riskLevel: 'low',
        enabled: true,
        payload: {},
      },
    ]);
    assert.match(events.at(-1).content.blocks[0].text, /cover/i);
    assert.match(events.at(-1).content.blocks[0].text, /Review/i);
  });

  it('supports simple named album cover prompts', async () => {
    const albums = [familyAlbumSummary()];
    const { calls, fetchImplementation } = createFetch(
      previewHighlightHandlers({
        albums,
        albumAssetIds: highlightAssetIds,
      }),
    );
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody({ initialContext: { providerSupportsImages: true } }));

    await collectEvents(runtime, 'Pick a cover for Family.');

    const plan = calls.at(-1).body.params.arguments;
    assert.deepEqual(
      plan.operations.map((operation) => operation.type),
      ['album.setCover'],
    );
    assert.deepEqual(plan.operations[0].assetIds, ['00000000-0000-4000-8000-000000000402']);
  });

  it('falls back to metadata-only cover selection when preview reads are denied', async () => {
    const albums = [familyAlbumSummary()];
    const handlers = previewHighlightHandlers({ albums, albumAssetIds: highlightAssetIds });
    handlers[2] = {
      name: 'readAssetPreviews',
      handle: (_args, request) => ({
        body: {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            structuredContent: {
              status: 'denied',
              summary: 'Preview reads are denied in this session',
            },
          },
        },
      }),
    };
    const { calls, fetchImplementation } = createFetch(handlers);
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody({ initialContext: { providerSupportsImages: true } }));

    const events = await collectEvents(runtime, 'Pick a better cover for Family.');

    assert.equal(
      calls.map((call) => call.body.params.name).join(','),
      'listAlbums,readAlbum,readAssetMetadata,readAssetPreviews,proposeAlbumOperations',
    );
    assert.match(calls.at(-1).body.params.arguments.summary, /metadata-only/i);
    assert.match(events.at(-1).content.blocks[0].text, /Previews were unavailable/i);
  });

  it('keeps provider-without-image-input cover selection metadata-only without preview reads', async () => {
    const albums = [familyAlbumSummary()];
    const { calls, fetchImplementation } = createFetch(
      previewHighlightHandlers({
        albums,
        albumAssetIds: highlightAssetIds,
      }),
    );
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody({ initialContext: { providerSupportsImages: false } }));

    const events = await collectEvents(runtime, 'Pick a better cover for Family.');

    assert.equal(
      calls.map((call) => call.body.params.name).join(','),
      'listAlbums,readAlbum,readAssetMetadata,proposeAlbumOperations',
    );
    assert.match(calls.at(-1).body.params.arguments.summary, /metadata-only/i);
    assert.match(events.at(-1).content.blocks[0].text, /metadata-only/i);
  });

  it('asks to narrow cover selection when a preview-capable album exceeds the preview limit', async () => {
    const albums = [familyAlbumSummary()];
    const oversizedAssetIds = Array.from(
      { length: 251 },
      (_value, index) => `00000000-0000-4000-8000-${String(3000 + index).padStart(12, '0')}`,
    );
    const { calls, fetchImplementation } = createFetch(
      previewHighlightHandlers({
        albums,
        albumAssetIds: oversizedAssetIds,
      }),
    );
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody({ initialContext: { providerSupportsImages: true } }));

    const events = await collectEvents(runtime, 'Pick a better cover for Family.');

    assert.equal(calls.map((call) => call.body.params.name).join(','), 'listAlbums,readAlbum');
    assert.match(events.at(-1).content.blocks[0].text, /too many assets/i);
    assert.match(events.at(-1).content.blocks[0].text, /narrow/i);
  });

  it('never reads originals for highlight or cover curation', async () => {
    const albums = [familyAlbumSummary()];
    const { calls, fetchImplementation } = createFetch([
      ...previewHighlightHandlers({ albums, albumAssetIds: highlightAssetIds }),
      {
        name: 'readAssetOriginals',
        handle: (_args, request) => ({
          body: {
            jsonrpc: '2.0',
            id: request.id,
            result: { structuredContent: { originals: [] } },
          },
        }),
      },
    ]);
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody({ initialContext: { providerSupportsImages: true } }));

    await collectEvents(runtime, 'Pick the best 2 photos from last weekend and make an album called Weekend Highlights.');
    await collectEvents(runtime, 'Pick a better cover for Family.');

    assert.equal(calls.some((call) => call.body.params.name === 'readAssetOriginals'), false);
  });

  it('keeps favorite in a requested album name from becoming a favorite operation', async () => {
    const { calls, fetchImplementation } = createFetch(metadataHighlightHandlers());
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody());

    await collectEvents(runtime, 'Pick the best 2 photos from last weekend and make an album called Favorite Highlights.');

    assert.equal(calls.map((call) => call.body.params.name).join(','), 'searchAssets,curateSelection,proposeAlbumFromSelection');
    const plan = calls[2].body.params.arguments;
    assert.equal(plan.albumName, 'Favorite Highlights');
    assert.equal(plan.selectionHandleId, usaTripCuratedHandleId);
    assert.equal(JSON.stringify(plan).includes('assetIds'), false);
  });

  it('parses album names before trailing source phrases in highlight album requests', async () => {
    const { calls, fetchImplementation } = createFetch(metadataHighlightHandlers());
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody());

    await collectEvents(runtime, 'Pick the best 2 photos and make an album called Weekend Highlights from last weekend.');

    assert.equal(calls.map((call) => call.body.params.name).join(','), 'searchAssets,curateSelection,proposeAlbumFromSelection');
    const plan = calls[2].body.params.arguments;
    assert.equal(plan.albumName, 'Weekend Highlights');
    assert.equal(plan.selectionHandleId, usaTripCuratedHandleId);
    assert.equal(JSON.stringify(plan).includes('assetIds'), false);
  });

  it('adds metadata highlights to an existing album while excluding assets already in the album', async () => {
    const albums = [familyAlbumSummary()];
    const { calls, fetchImplementation } = createFetch(
      metadataHighlightHandlers({
        albums,
        albumAssetIds: ['00000000-0000-4000-8000-000000000402'],
      }),
    );
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody());

    const events = await collectEvents(runtime, 'Add 2 highlights from last weekend to Family.');

    assert.equal(
      calls.map((call) => call.body.params.name).join(','),
      'listAlbums,readAlbum,searchAssets,readAssetMetadata,proposeAlbumOperations',
    );
    assert.deepEqual(calls[1].body.params.arguments, { albumId: familyAlbumId });
    assert.equal(calls[2].body.params.arguments.limit, 1000);
    const plan = calls.at(-1).body.params.arguments;
    assert.equal(JSON.stringify(plan).includes('assetSource'), false);
    assert.equal(JSON.stringify(plan).includes('previousSearch'), false);
    assert.deepEqual(plan.operations, [
      {
        type: 'album.addAssets',
        summary: 'Add 2 metadata-only suggested highlights to Family.',
        targetKind: 'existing_album',
        targetId: familyAlbumId,
        assetIds: [
          '00000000-0000-4000-8000-000000000403',
          '00000000-0000-4000-8000-000000000401',
        ],
        riskLevel: 'medium',
        enabled: true,
        payload: {},
      },
    ]);
    assert.match(events.at(-1).content.blocks[0].text, /excluded 1 already in Family/i);
  });

  it('parses existing-album names before trailing source phrases in add-highlight requests', async () => {
    const albums = [familyAlbumSummary()];
    const { calls, fetchImplementation } = createFetch(
      metadataHighlightHandlers({
        albums,
      }),
    );
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody());

    await collectEvents(runtime, 'Add 2 highlights to Family from last weekend.');

    assert.equal(
      calls.map((call) => call.body.params.name).join(','),
      'listAlbums,readAlbum,searchAssets,readAssetMetadata,proposeAlbumOperations',
    );
    assert.deepEqual(calls[1].body.params.arguments, { albumId: familyAlbumId });
    assert.equal(calls.at(-1).body.params.arguments.operations[0].targetId, familyAlbumId);
  });

  it('proposes favorite operations for metadata-only highlight selections', async () => {
    const { calls, fetchImplementation } = createFetch(metadataHighlightHandlers());
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody());

    const events = await collectEvents(runtime, 'Favorite the best 2 photos from last weekend.');

    assert.equal(calls.map((call) => call.body.params.name).join(','), 'searchAssets,curateSelection,proposeAssetBatchFromSelection');
    const plan = calls[2].body.params.arguments;
    assert.deepEqual(plan.action, { type: 'asset.setFavorite', favorite: true });
    assert.equal(plan.selectionHandleId, usaTripCuratedHandleId);
    assert.equal(JSON.stringify(plan).includes('assetIds'), false);
    assert.match(events.at(-1).content.blocks[0].text, /favorite/i);
    assert.match(events.at(-1).content.blocks[0].text, /metadata-only/i);
  });

  it('plans available metadata highlights when fewer candidates than requested exist', async () => {
    const { calls, fetchImplementation } = createFetch(
      metadataHighlightHandlers({
        assetIds: highlightAssetIds,
        curatedCount: 2,
      }),
    );
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody());

    const events = await collectEvents(
      runtime,
      'Pick the best 5 photos from last weekend and make an album called Weekend Highlights.',
    );

    assert.equal(calls.map((call) => call.body.params.name).join(','), 'searchAssets,curateSelection,proposeAlbumFromSelection');
    assert.equal(calls[0].body.params.arguments.limit, 1000);
    assert.equal(calls[2].body.params.arguments.selectionHandleId, usaTripCuratedHandleId);
    assert.equal(JSON.stringify(calls[2].body.params.arguments).includes('assetIds'), false);
    assert.match(events.at(-1).content.blocks[0].text, /Only 2 eligible/i);
    assert.match(events.at(-1).content.blocks[0].text, /requested 5/i);
  });

  it('asks to narrow metadata highlight plans when the bounded source exceeds the metadata candidate limit', async () => {
    const oversizedAssetIds = Array.from(
      { length: 1001 },
      (_value, index) => `00000000-0000-4000-8000-${String(1000 + index).padStart(12, '0')}`,
    );
    const { calls, fetchImplementation } = createFetch(
      metadataHighlightHandlers({
        assetIds: oversizedAssetIds,
      }),
    );
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody());

    const events = await collectEvents(
      runtime,
      'Pick the best 2 photos from last weekend and make an album called Weekend Highlights.',
    );

    assert.equal(calls.map((call) => call.body.params.name).join(','), 'searchAssets');
    assert.equal(calls[0].body.params.arguments.limit, 1000);
    assert.match(events.at(-1).content.blocks[0].text, /too many/i);
    assert.match(events.at(-1).content.blocks[0].text, /narrow/i);
  });

  it('uses a default count of 10 for bounded highlight prompts without creating a plan', async () => {
    const { calls, fetchImplementation } = createFetch(successHandlers());
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody());

    const events = await collectEvents(runtime, 'Suggest highlights from last weekend.');

    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.params.name, 'searchAssets');
    assert.deepEqual(calls[0].body.params.arguments, {
      filters: lastWeekendHighlightFilters,
      detail: 'ids',
      limit: 10,
    });
    assert.match(events.at(-1).content.blocks[0].text, /default/i);
    assert.match(events.at(-1).content.blocks[0].text, /\b10\b/);
    assert.match(events.at(-1).content.blocks[0].text, /3 candidate/i);
  });

  it('asks for a concrete searchable source instead of searching all assets for unresolved album highlights', async () => {
    const { calls, fetchImplementation } = createFetch(successHandlers());
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody());

    const events = await collectEvents(runtime, 'Suggest 10 highlights from this album.');

    assert.equal(calls.length, 0);
    assert.match(events.at(-1).content.blocks[0].text, /current album context/i);
  });

  it('asks for a positive highlight count for zero or negative requests without creating a plan', async () => {
    for (const prompt of ['Suggest 0 highlights from this album.', 'Pick -3 best photos from this album.']) {
      const { calls, fetchImplementation } = createFetch(successHandlers());
      const runtime = createE2eRuntime({ fetch: fetchImplementation });
      await runtime.createSession(createSessionBody());

      const events = await collectEvents(runtime, prompt);

      assert.equal(calls.length, 0);
      assert.match(events.at(-1).content.blocks[0].text, /positive count/i);
    }
  });

  it('asks to narrow oversized highlight requests without creating a plan', async () => {
    const { calls, fetchImplementation } = createFetch(successHandlers());
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody());

    const events = await collectEvents(runtime, 'Suggest 1001 highlights from this album.');

    assert.equal(calls.length, 0);
    assert.match(events.at(-1).content.blocks[0].text, /1000 or fewer/i);
    assert.match(events.at(-1).content.blocks[0].text, /narrow/i);
  });

  it('asks to narrow oversized bounded candidate sets without creating a plan', async () => {
    const { calls, fetchImplementation } = createFetch([
      {
        name: 'searchAssets',
        handle: (_args, request) => ({
          body: {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              structuredContent: {
                status: 'success',
                assetIds: ['00000000-0000-4000-8000-000000000201'],
                returnedCount: 1001,
                hasMore: true,
              },
            },
          },
        }),
      },
      successHandlers()[1],
      successHandlers()[2],
    ]);
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody());

    const events = await collectEvents(runtime, 'Suggest 10 highlights from last weekend.');

    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.params.name, 'searchAssets');
    assert.deepEqual(calls[0].body.params.arguments.filters, lastWeekendHighlightFilters);
    assert.match(events.at(-1).content.blocks[0].text, /too many/i);
    assert.match(events.at(-1).content.blocks[0].text, /narrow/i);
  });

  it('asks to narrow when Gallery reports a known highlight total above the candidate limit', async () => {
    const { calls, fetchImplementation } = createFetch([
      {
        name: 'searchAssets',
        handle: (_args, request) => ({
          body: {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              structuredContent: {
                status: 'success',
                assetIds: [
                  '00000000-0000-4000-8000-000000000201',
                  '00000000-0000-4000-8000-000000000202',
                ],
                returnedCount: 10,
                totalCount: 1001,
                hasMore: true,
              },
            },
          },
        }),
      },
      successHandlers()[1],
      successHandlers()[2],
    ]);
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody());

    const events = await collectEvents(runtime, 'Suggest 10 highlights from last weekend.');

    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.params.name, 'searchAssets');
    assert.deepEqual(calls[0].body.params.arguments.filters, lastWeekendHighlightFilters);
    assert.match(events.at(-1).content.blocks[0].text, /too many/i);
    assert.match(events.at(-1).content.blocks[0].text, /narrow/i);
  });

  it('does not treat ordinary pagination as an oversized highlight candidate set', async () => {
    const { calls, fetchImplementation } = createFetch([
      {
        name: 'searchAssets',
        handle: (_args, request) => ({
          body: {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              structuredContent: {
                status: 'success',
                assetIds: [
                  '00000000-0000-4000-8000-000000000201',
                  '00000000-0000-4000-8000-000000000202',
                ],
                returnedCount: 10,
                hasMore: true,
              },
            },
          },
        }),
      },
      successHandlers()[1],
      successHandlers()[2],
    ]);
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody());

    const events = await collectEvents(runtime, 'Suggest 10 highlights from last weekend.');

    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.params.name, 'searchAssets');
    assert.deepEqual(calls[0].body.params.arguments.filters, lastWeekendHighlightFilters);
    assert.doesNotMatch(events.at(-1).content.blocks[0].text, /too many/i);
    assert.match(events.at(-1).content.blocks[0].text, /10 candidate/i);
    assert.match(events.at(-1).content.blocks[0].text, /did not create a plan/i);
  });

  it('answers directly when a bounded highlight source has no candidates without creating a plan', async () => {
    const { calls, fetchImplementation } = createFetch([
      {
        name: 'searchAssets',
        handle: (_args, request) => ({
          body: {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              structuredContent: {
                status: 'success',
                assetIds: [],
                returnedCount: 0,
                hasMore: false,
              },
            },
          },
        }),
      },
      successHandlers()[1],
      successHandlers()[2],
    ]);
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody());

    const events = await collectEvents(runtime, 'Suggest 10 highlights from last weekend.');

    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.params.name, 'searchAssets');
    assert.deepEqual(calls[0].body.params.arguments.filters, lastWeekendHighlightFilters);
    assert.match(events.at(-1).content.blocks[0].text, /no matching/i);
    assert.match(events.at(-1).content.blocks[0].text, /did not create a plan/i);
  });

  describe('highlight curation acceptance smoke', () => {
    it('creates a highlights album from the current album context', async () => {
      const albums = [familyAlbumSummary()];
      const { calls, fetchImplementation } = createFetch(
        metadataHighlightHandlers({
          albums,
          albumAssetIds: currentAlbumAssetIds,
          metadataAssets: currentAlbumMetadataAssets(),
        }),
      );
      const runtime = createE2eRuntime({ fetch: fetchImplementation });
      await runtime.createSession(createSessionBody({ initialContext: currentAlbumSessionContext() }));

      const events = await collectEvents(
        runtime,
        'Suggest 5 highlights from this album and make an album called Highlights.',
      );

      assert.equal(calls.map((call) => call.body.params.name).join(','), 'readAlbum,readAssetMetadata,proposeAlbumOperations');
      assert.deepEqual(calls[0].body.params.arguments, { albumId: familyAlbumId });
      const plan = calls.at(-1).body.params.arguments;
      assert.equal(JSON.stringify(plan).includes('assetSource'), false);
      assert.equal(JSON.stringify(plan).includes('previousSearch'), false);
      assert.equal(plan.operations[0].payload.albumName, 'Highlights');
      assert.deepEqual(
        plan.operations.map((operation) => operation.type),
        ['album.create', 'album.addAssets'],
      );
      assert.equal(plan.operations[1].assetIds.length, 5);
      assert.match(plan.summary, /metadata-only/i);
      assert.match(events.at(-1).content.blocks[0].text, /5 suggested highlights|5 .*highlights/i);
      assert.match(events.at(-1).content.blocks[0].text, /Review/i);
    });

    it('favorites the best 3 photos from last weekend', async () => {
      const { calls, fetchImplementation } = createFetch(metadataHighlightHandlers());
      const runtime = createE2eRuntime({ fetch: fetchImplementation });
      await runtime.createSession(createSessionBody());

      const events = await collectEvents(runtime, 'Favorite the best 3 photos from last weekend.');

      assert.equal(calls.map((call) => call.body.params.name).join(','), 'searchAssets,curateSelection,proposeAssetBatchFromSelection');
      const plan = calls.at(-1).body.params.arguments;
      assert.equal(plan.summary, 'Favorite 3 metadata-only curated highlights.');
      assert.deepEqual(plan.action, { type: 'asset.setFavorite', favorite: true });
      assert.equal(plan.selectionHandleId, usaTripCuratedHandleId);
      assert.equal(JSON.stringify(plan).includes('assetIds'), false);
      assert.match(events.at(-1).content.blocks[0].text, /3 metadata-only suggested highlights/i);
    });

    it('picks a cover from the current album context', async () => {
      const albums = [familyAlbumSummary()];
      const { calls, fetchImplementation } = createFetch(
        previewHighlightHandlers({
          albums,
          albumAssetIds: currentAlbumAssetIds,
          metadataAssets: currentAlbumMetadataAssets(),
        }),
      );
      const runtime = createE2eRuntime({ fetch: fetchImplementation });
      await runtime.createSession(
        createSessionBody({ initialContext: { ...currentAlbumSessionContext(), providerSupportsImages: true } }),
      );

      const events = await collectEvents(runtime, 'Pick a cover from this album.');

      assert.equal(
        calls.map((call) => call.body.params.name).join(','),
        'readAlbum,readAssetMetadata,readAssetPreviews,proposeAlbumOperations',
      );
      assert.deepEqual(calls[0].body.params.arguments, { albumId: familyAlbumId });
      const plan = calls.at(-1).body.params.arguments;
      assert.deepEqual(
        plan.operations.map((operation) => operation.type),
        ['album.setCover'],
      );
      assert.equal(plan.operations[0].assetIds.length, 1);
      assert.match(plan.summary, /cover/i);
      assert.match(events.at(-1).content.blocks[0].text, /cover/i);
      assert.match(events.at(-1).content.blocks[0].text, /Review/i);
    });

    it('asks for scope and creates no plan for best photos from the library', async () => {
      const { calls, fetchImplementation } = createFetch(successHandlers());
      const runtime = createE2eRuntime({ fetch: fetchImplementation });
      await runtime.createSession(createSessionBody());

      const events = await collectEvents(runtime, 'Pick the best photos from my library.');

      assert.equal(calls.length, 0);
      assert.match(events.at(-1).content.blocks[0].text, /bounded source/i);
      assert.match(events.at(-1).content.blocks[0].text, /\?/);
    });

    it('proposes the 7 eligible current-album assets when 20 are requested', async () => {
      const sevenAssetIds = currentAlbumAssetIds.slice(0, 7);
      const albums = [familyAlbumSummary()];
      const { calls, fetchImplementation } = createFetch(
        metadataHighlightHandlers({
          albums,
          albumAssetIds: sevenAssetIds,
          metadataAssets: currentAlbumMetadataAssets().slice(0, 7),
        }),
      );
      const runtime = createE2eRuntime({ fetch: fetchImplementation });
      await runtime.createSession(createSessionBody({ initialContext: currentAlbumSessionContext() }));

      const events = await collectEvents(
        runtime,
        'Suggest 20 highlights from this album and make an album called Highlights.',
      );

      assert.equal(calls.map((call) => call.body.params.name).join(','), 'readAlbum,readAssetMetadata,proposeAlbumOperations');
      const plan = calls.at(-1).body.params.arguments;
      assert.equal(plan.operations[1].assetIds.length, 7);
      assert.match(events.at(-1).content.blocks[0].text, /Only 7 eligible candidates/i);
      assert.match(events.at(-1).content.blocks[0].text, /requested 20/i);
    });

    it('reports no matches and creates no plan for an empty bounded source', async () => {
      const { calls, fetchImplementation } = createFetch([
        {
          name: 'searchAssets',
          handle: (_args, request) => ({
            body: {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                structuredContent: {
                  status: 'success',
                  assetIds: [],
                  returnedCount: 0,
                  hasMore: false,
                },
              },
            },
          }),
        },
        successHandlers()[1],
      ]);
      const runtime = createE2eRuntime({ fetch: fetchImplementation });
      await runtime.createSession(createSessionBody());

      const events = await collectEvents(runtime, 'Suggest highlights from last weekend.');

      assert.equal(calls.map((call) => call.body.params.name).join(','), 'searchAssets');
      assert.match(events.at(-1).content.blocks[0].text, /no matching/i);
      assert.match(events.at(-1).content.blocks[0].text, /did not create a plan/i);
    });

    it('does not fall back to broad search when current album asset ids are unavailable', async () => {
      const { calls, fetchImplementation } = createFetch([
        {
          name: 'readAlbum',
          handle: (_args, request) => ({
            body: {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                structuredContent: {
                  album: familyAlbumSummary(),
                },
              },
            },
          }),
        },
        {
          name: 'searchAssets',
          handle: (_args, request) => ({
            body: {
              jsonrpc: '2.0',
              id: request.id,
              error: { code: -32000, message: 'current album highlight curation must not search broadly' },
            },
          }),
        },
        successHandlers()[1],
      ]);
      const runtime = createE2eRuntime({ fetch: fetchImplementation });
      await runtime.createSession(createSessionBody({ initialContext: currentAlbumSessionContext() }));

      const events = await collectEvents(
        runtime,
        'Suggest 5 highlights from this album and make an album called Highlights.',
      );

      assert.equal(calls.map((call) => call.body.params.name).join(','), 'readAlbum');
      assert.match(events.at(-1).content.blocks[0].text, /no matching/i);
      assert.match(events.at(-1).content.blocks[0].text, /did not create a plan/i);
    });

    it('reports current album read failures instead of throwing out of highlight curation', async () => {
      const { calls, fetchImplementation } = createFetch([
        {
          name: 'readAlbum',
          handle: (_args, request) => ({
            body: {
              jsonrpc: '2.0',
              id: request.id,
              error: { code: -32000, message: `album lookup denied with ${token}` },
            },
          }),
        },
        successHandlers()[1],
      ]);
      const runtime = createE2eRuntime({ fetch: fetchImplementation });
      await runtime.createSession(createSessionBody({ initialContext: currentAlbumSessionContext() }));

      const events = await collectEvents(
        runtime,
        'Suggest 5 highlights from this album and make an album called Highlights.',
      );

      assert.equal(calls.map((call) => call.body.params.name).join(','), 'readAlbum');
      assert.match(events.at(-1).content.blocks[0].text, /could not inspect highlight candidates/i);
      assert.equal(events.at(-1).content.blocks[0].text.includes(token), false);
    });
  });

  it('reports a denied proposal without leaking the gateway token', async () => {
    const { calls, fetchImplementation } = createFetch([
      {
        name: 'proposeAlbumOperations',
        handle: (_args, request) => ({
          body: {
            jsonrpc: '2.0',
            id: request.id,
            error: { code: -32000, message: `denied with ${token}` },
          },
        }),
      },
    ]);
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody());

    const events = await collectEvents(runtime, 'Create a denied test album.');

    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.params.name, 'proposeAlbumOperations');
    assert.equal(calls[0].body.params.arguments.summary, 'Denied Trip would use inaccessible assets.');
    assert.equal(events.at(-1).type, 'assistant-message-completed');
    assert.match(events.at(-1).content.blocks[0].text, /Gallery denied the album organization request/);
    assert.equal(events.at(-1).content.blocks[0].text.includes(token), false);
    assert.match(events.at(-1).content.blocks[0].text, /\[redacted\]/);
  });

  it('reports insufficient visible assets without creating a proposal or leaking the gateway token', async () => {
    const { calls, fetchImplementation } = createFetch([
      {
        name: 'searchAssets',
        handle: (_args, request) => ({
          body: {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              structuredContent: {
                status: 'success',
                assets: [{ id: '00000000-0000-4000-8000-000000000201' }],
              },
            },
          },
        }),
      },
    ]);
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody());

    const events = await collectEvents(runtime, 'Create a Portugal trip album.');

    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.params.name, 'searchAssets');
    assert.equal(events.at(-1).type, 'assistant-message-completed');
    assert.match(events.at(-1).content.blocks[0].text, /needs at least two visible loose assets/);
    assert.equal(events.at(-1).content.blocks[0].text.includes(token), false);
  });

  it('reports MCP tool result errors without leaking the gateway token', async () => {
    const { fetchImplementation } = createFetch([
      {
        name: 'searchAssets',
        handle: (_args, request) => ({
          body: {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              isError: true,
              content: [{ type: 'text', text: `tool failed with ${token}` }],
            },
          },
        }),
      },
    ]);
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody());

    const events = await collectEvents(runtime, 'Create a Portugal trip album.');

    assert.equal(events.at(-1).type, 'assistant-message-completed');
    assert.match(events.at(-1).content.blocks[0].text, /Gallery denied the album organization request/);
    assert.equal(events.at(-1).content.blocks[0].text.includes(token), false);
    assert.match(events.at(-1).content.blocks[0].text, /\[redacted\]/);
  });

  it('rejects messages for unknown runner sessions', async () => {
    const runtime = createE2eRuntime();

    await assert.rejects(() => collectEvents(runtime, 'Create an album.'), /Runner session not found/);
  });
});
