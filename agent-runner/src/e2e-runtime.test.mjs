import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createE2eRuntime } from './e2e-runtime.mjs';

const gallerySessionId = '00000000-0000-4000-8000-000000000100';
const runnerSessionId = `e2e-${gallerySessionId}`;
const token = 'gateway-token-secret';
const gateway = { url: 'http://gallery.example.test/api/agent/mcp/sessions/00000000-0000-4000-8000-000000000100', token };

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
