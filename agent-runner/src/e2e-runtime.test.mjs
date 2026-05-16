import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createE2eRuntime } from './e2e-runtime.mjs';

const gallerySessionId = '00000000-0000-4000-8000-000000000100';
const runnerSessionId = `e2e-${gallerySessionId}`;
const token = 'gateway-token-secret';
const gateway = { url: 'http://gallery.example.test/api/agent/internal/tools', token };

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
  toolGateway: gateway,
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
    calls.push({ path, body, authorization: init?.headers?.Authorization });

    const handler = handlers.find((candidate) => path.endsWith(candidate.path));
    if (!handler) {
      return new Response(JSON.stringify({ error: `unexpected path ${path}` }), { status: 500 });
    }

    const result = await handler.handle(body);
    return new Response(JSON.stringify(result.body), {
      status: result.status ?? 201,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  return { calls, fetchImplementation };
};

const successHandlers = () => [
  {
    path: '/search-assets',
    handle: () => ({
      body: {
        status: 'success',
        assets: [
          { id: '00000000-0000-4000-8000-000000000201' },
          { id: '00000000-0000-4000-8000-000000000202' },
          { id: '00000000-0000-4000-8000-000000000203' },
        ],
      },
    }),
  },
  {
    path: '/propose-album-operations',
    handle: (body) => ({
      body: {
        status: 'success',
        summary: 'Stored 3 proposed operations.',
        plan: { id: '00000000-0000-4000-8000-000000000301' },
        toolCall: null,
        received: body,
      },
    }),
  },
];

describe('e2e runtime', () => {
  it('creates a runner session with Gallery tool capabilities', async () => {
    const runtime = createE2eRuntime();

    const session = await runtime.createSession(createSessionBody());

    assert.equal(runtime.getCapabilities().runtime, 'e2e');
    assert.equal(runtime.getCapabilities().tools.includes('proposeAlbumOperations'), true);
    assert.equal(session.runnerSessionId, runnerSessionId);
    assert.equal(session.capabilities.protocolVersion, '2026-05-14');
    assert.equal(session.capabilities.streaming, true);
    assert.equal(session.capabilities.models.includes('e2e-album-organizer'), true);
    assert.equal(session.capabilities.tools.includes('proposeAlbumOperations'), true);
    assert.equal(JSON.stringify(session).includes(token), false);
  });

  it('searches visible assets and proposes a deterministic album plan', async () => {
    const { calls, fetchImplementation } = createFetch(successHandlers());
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody());

    const events = await collectEvents(runtime, 'Create a Portugal trip album.');

    assert.equal(calls.length, 2);
    assert.equal(calls[0].path.endsWith('/search-assets'), true);
    assert.deepEqual(calls[0].body, { filters: { isNotInAlbum: true }, limit: 3 });
    assert.equal(calls[0].authorization, `Bearer ${token}`);
    assert.equal(calls[1].path.endsWith('/propose-album-operations'), true);
    assert.equal(calls[1].body.summary, 'Create Portugal Trip and add 2 loose assets.');
    assert.deepEqual(
      calls[1].body.operations.map((operation) => operation.type),
      ['album.create', 'album.addAssets', 'album.setCover'],
    );
    assert.deepEqual(calls[1].body.operations[1].assetIds, [
      '00000000-0000-4000-8000-000000000201',
      '00000000-0000-4000-8000-000000000202',
    ]);
    assert.deepEqual(calls[1].body.operations[2].assetIds, ['00000000-0000-4000-8000-000000000201']);
    assert.equal(events.at(-1).type, 'assistant-message-completed');
    assert.match(events.at(-1).content.blocks[0].text, /I proposed a Portugal Trip album/);
  });

  it('reports a denied proposal without leaking the gateway token', async () => {
    const { calls, fetchImplementation } = createFetch([
      {
        path: '/propose-album-operations',
        handle: () => ({
          status: 400,
          body: { message: `denied with ${token}` },
        }),
      },
    ]);
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody());

    const events = await collectEvents(runtime, 'Create a denied test album.');

    assert.equal(calls.length, 1);
    assert.equal(calls[0].path.endsWith('/propose-album-operations'), true);
    assert.equal(calls[0].body.summary, 'Denied Trip would use inaccessible assets.');
    assert.equal(events.at(-1).type, 'assistant-message-completed');
    assert.match(events.at(-1).content.blocks[0].text, /Gallery denied the album organization request/);
    assert.equal(events.at(-1).content.blocks[0].text.includes(token), false);
    assert.match(events.at(-1).content.blocks[0].text, /\[redacted\]/);
  });

  it('reports insufficient visible assets without creating a proposal or leaking the gateway token', async () => {
    const { calls, fetchImplementation } = createFetch([
      {
        path: '/search-assets',
        handle: () => ({
          body: {
            status: 'success',
            assets: [{ id: '00000000-0000-4000-8000-000000000201' }],
          },
        }),
      },
    ]);
    const runtime = createE2eRuntime({ fetch: fetchImplementation });
    await runtime.createSession(createSessionBody());

    const events = await collectEvents(runtime, 'Create a Portugal trip album.');

    assert.equal(calls.length, 1);
    assert.equal(calls[0].path.endsWith('/search-assets'), true);
    assert.equal(events.at(-1).type, 'assistant-message-completed');
    assert.match(events.at(-1).content.blocks[0].text, /needs at least two visible loose assets/);
    assert.equal(events.at(-1).content.blocks[0].text.includes(token), false);
  });

  it('rejects messages for unknown runner sessions', async () => {
    const runtime = createE2eRuntime();

    await assert.rejects(() => collectEvents(runtime, 'Create an album.'), /Runner session not found/);
  });
});
