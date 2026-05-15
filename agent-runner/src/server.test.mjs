import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { startServer } from './server.mjs';

const parseSse = (body) =>
  body
    .trim()
    .split('\n\n')
    .filter(Boolean)
    .map((frame) => {
      const lines = frame.split('\n');
      const event = lines.find((line) => line.startsWith('event: '))?.slice('event: '.length);
      const data = lines.find((line) => line.startsWith('data: '))?.slice('data: '.length);
      return { event, data: data ? JSON.parse(data) : null };
    });

const readSse = async (response) => parseSse(await response.text());

const withServer = async (runtime, test) => {
  const server = await startServer({ port: 0, runtime });
  const address = server.address();
  assert.equal(typeof address, 'object');
  assert.notEqual(address, null);
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await test(baseUrl);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
};

const createSessionBody = (overrides = {}) => ({
  gallerySessionId: '00000000-0000-4000-8000-000000000100',
  credential: {
    id: '00000000-0000-4000-8000-000000000001',
    providerType: 'openai',
    label: 'OpenAI personal',
    baseUrl: null,
    models: ['gpt-5.1'],
    defaultModel: 'gpt-5.1',
    secret: 'sk-session-secret',
  },
  model: 'gpt-5.1',
  permissionPreset: 'careful',
  permissionPlan: {},
  approvalMode: 'strict',
  initialContext: {},
  ...overrides,
});

const createRuntime = ({ createSession, sendMessage } = {}) => {
  const calls = { createSession: [], sendMessage: [] };

  return {
    calls,
    async createSession(body) {
      calls.createSession.push(body);
      if (createSession) {
        return createSession(body);
      }

      return {
        runnerSessionId: `pi-${body.gallerySessionId}`,
        capabilities: {
          protocolVersion: '2026-05-14',
          streaming: true,
          tools: [],
          models: [body.model],
          runtime: 'pi',
        },
      };
    },
    async *sendMessage(body) {
      calls.sendMessage.push(body);
      if (sendMessage) {
        yield* sendMessage(body);
        return;
      }

      yield {
        type: 'assistant-message-delta',
        sessionId: body.gallerySessionId,
        runnerSessionId: body.runnerSessionId,
        delta: 'Runtime says hello',
        sequence: 1,
      };
      yield {
        type: 'assistant-message-completed',
        sessionId: body.gallerySessionId,
        runnerSessionId: body.runnerSessionId,
        providerMessageId: 'provider-message-1',
        content: { blocks: [{ type: 'text', text: 'Runtime says hello' }] },
      };
    },
  };
};

const messageBody = {
  gallerySessionId: '00000000-0000-4000-8000-000000000100',
  messageId: '00000000-0000-4000-8000-000000000200',
  content: { blocks: [{ type: 'text', text: 'Hello runner' }] },
};

describe('agent runner server', () => {
  it('can be imported when process argv path is undefined', async () => {
    const originalArgvPath = process.argv[1];
    process.argv[1] = undefined;

    try {
      const module = await import(`./server.mjs?argv-undefined=${Date.now()}`);

      assert.equal(typeof module.startServer, 'function');
    } finally {
      if (originalArgvPath === undefined) {
        delete process.argv[1];
      } else {
        process.argv[1] = originalArgvPath;
      }
    }
  });

  it('returns health capabilities', async () => {
    await withServer(createRuntime(), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/health`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        status: 'ok',
        version: '0.1.0',
        capabilities: {
          protocolVersion: '2026-05-14',
          streaming: true,
          tools: [],
          models: [],
          runtime: 'pi',
        },
      });
    });
  });

  it('creates a runtime-backed runner session without returning the credential secret', async () => {
    const runtime = createRuntime();

    await withServer(runtime, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createSessionBody()),
      });

      assert.equal(response.status, 201);
      const responseBody = await response.text();
      assert.equal(responseBody.includes('sk-session-secret'), false);
      assert.deepEqual(JSON.parse(responseBody), {
        runnerSessionId: 'pi-00000000-0000-4000-8000-000000000100',
        capabilities: {
          protocolVersion: '2026-05-14',
          streaming: true,
          tools: [],
          models: ['gpt-5.1'],
          runtime: 'pi',
        },
      });
      assert.equal(runtime.calls.createSession.length, 1);
      assert.equal(runtime.calls.createSession[0].credential.secret, 'sk-session-secret');
    });
  });

  it('filters successful runtime session creation responses to protocol fields', async () => {
    const runtime = createRuntime({
      createSession: async () => ({
        runnerSessionId: 'pi-extra-fields',
        capabilities: {
          protocolVersion: '2026-05-14',
          streaming: true,
          tools: [],
          models: ['gpt-5.1'],
          runtime: 'pi',
        },
        credential: { secret: 'sk-runtime-response-secret' },
        debug: 'runtime internals',
      }),
    });

    await withServer(runtime, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createSessionBody()),
      });

      assert.equal(response.status, 201);
      const responseBody = await response.text();
      assert.equal(responseBody.includes('sk-runtime-response-secret'), false);
      assert.deepEqual(JSON.parse(responseBody), {
        runnerSessionId: 'pi-extra-fields',
        capabilities: {
          protocolVersion: '2026-05-14',
          streaming: true,
          tools: [],
          models: ['gpt-5.1'],
          runtime: 'pi',
        },
      });
    });
  });

  it('rejects invalid runtime session creation responses without leaking or tracking them', async () => {
    const runtime = createRuntime({
      createSession: async () => ({
        runnerSessionId: 123,
        capabilities: {
          protocolVersion: '2026-05-14',
          streaming: true,
          tools: [],
          models: ['gpt-5.1'],
        },
        credential: { secret: 'sk-runtime-response-secret' },
      }),
    });

    await withServer(runtime, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createSessionBody()),
      });

      assert.equal(response.status, 502);
      const responseBody = await response.text();
      assert.equal(responseBody.includes('sk-runtime-response-secret'), false);
      assert.deepEqual(JSON.parse(responseBody), { error: 'runner session creation failed' });

      const messageResponse = await fetch(`${baseUrl}/sessions/123/messages`, {
        method: 'POST',
        headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
        body: JSON.stringify(messageBody),
      });
      assert.equal(messageResponse.status, 404);
      assert.deepEqual(await messageResponse.json(), { error: 'runner session not found' });
    });
  });

  it('rejects session creation without a Gallery session id', async () => {
    await withServer(createRuntime(), async (baseUrl) => {
      const body = createSessionBody();
      delete body.gallerySessionId;

      const response = await fetch(`${baseUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'gallerySessionId is required' });
    });
  });

  it('rejects session creation without a credential', async () => {
    await withServer(createRuntime(), async (baseUrl) => {
      const body = createSessionBody();
      delete body.credential;

      const response = await fetch(`${baseUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'credential is required' });
    });
  });

  it('rejects session creation without a credential secret', async () => {
    await withServer(createRuntime(), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createSessionBody({ credential: { label: 'OpenAI personal' } })),
      });

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'credential.secret is required' });
    });
  });

  it('rejects session creation with an empty credential secret', async () => {
    await withServer(createRuntime(), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createSessionBody({ credential: { ...createSessionBody().credential, secret: '' } })),
      });

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'credential.secret is required' });
    });
  });

  it('rejects session creation without a model', async () => {
    await withServer(createRuntime(), async (baseUrl) => {
      const body = createSessionBody();
      delete body.model;

      const response = await fetch(`${baseUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'model is required' });
    });
  });

  it('rejects session creation with an empty model', async () => {
    await withServer(createRuntime(), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createSessionBody({ model: '' })),
      });

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'model is required' });
    });
  });

  it('returns a generic error when runtime session creation fails without leaking secrets', async () => {
    const runtime = createRuntime({
      createSession: async () => {
        throw new Error('provider rejected sk-session-secret');
      },
    });

    await withServer(runtime, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createSessionBody()),
      });

      assert.equal(response.status, 502);
      const responseBody = await response.text();
      assert.equal(responseBody.includes('sk-session-secret'), false);
      assert.deepEqual(JSON.parse(responseBody), { error: 'runner session creation failed' });
    });
  });

  it('rejects null session JSON without a Gallery session id', async () => {
    await withServer(createRuntime(), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(250),
        body: 'null',
      });

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'gallerySessionId is required' });
    });
  });

  it('rejects non-string Gallery session ids', async () => {
    await withServer(createRuntime(), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createSessionBody({ gallerySessionId: 123 })),
      });

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'gallerySessionId is required' });
    });
  });

  it('returns 400 for malformed session JSON', async () => {
    await withServer(createRuntime(), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      });

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'invalid JSON body' });
    });
  });

  it('streams runtime assistant message events for a message', async () => {
    const runtime = createRuntime();

    await withServer(runtime, async (baseUrl) => {
      const createResponse = await fetch(`${baseUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createSessionBody()),
      });
      assert.equal(createResponse.status, 201);

      const response = await fetch(`${baseUrl}/sessions/pi-00000000-0000-4000-8000-000000000100/messages`, {
        method: 'POST',
        headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
        body: JSON.stringify(messageBody),
      });

      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'text/event-stream');
      assert.deepEqual(await readSse(response), [
        {
          event: 'assistant-message-delta',
          data: {
            type: 'assistant-message-delta',
            sessionId: '00000000-0000-4000-8000-000000000100',
            runnerSessionId: 'pi-00000000-0000-4000-8000-000000000100',
            delta: 'Runtime says hello',
            sequence: 1,
          },
        },
        {
          event: 'assistant-message-completed',
          data: {
            type: 'assistant-message-completed',
            sessionId: '00000000-0000-4000-8000-000000000100',
            runnerSessionId: 'pi-00000000-0000-4000-8000-000000000100',
            providerMessageId: 'provider-message-1',
            content: { blocks: [{ type: 'text', text: 'Runtime says hello' }] },
          },
        },
      ]);
      assert.deepEqual(runtime.calls.sendMessage, [
        {
          runnerSessionId: 'pi-00000000-0000-4000-8000-000000000100',
          gallerySessionId: '00000000-0000-4000-8000-000000000100',
          messageId: '00000000-0000-4000-8000-000000000200',
          content: { blocks: [{ type: 'text', text: 'Hello runner' }] },
        },
      ]);
    });
  });

  it('returns 404 for unknown runner sessions', async () => {
    await withServer(createRuntime(), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/sessions/pi-missing/messages`, {
        method: 'POST',
        headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
        body: JSON.stringify(messageBody),
      });

      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: 'runner session not found' });
    });
  });

  it('returns 400 for malformed message JSON before checking runner session existence', async () => {
    await withServer(createRuntime(), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/sessions/pi-missing/messages`, {
        method: 'POST',
        headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
        body: '{',
      });

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'invalid JSON body' });
    });
  });

  it('returns a JSON error for malformed encoded runner session ids', async () => {
    await withServer(createRuntime(), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/sessions/%E0%A4%A/messages`, {
        method: 'POST',
        headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
        body: JSON.stringify(messageBody),
      });

      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: 'runner session not found' });
    });
  });

  it('rejects invalid message bodies before calling the runtime', async () => {
    const runtime = createRuntime();
    const cases = [
      {
        body: { messageId: messageBody.messageId, content: messageBody.content },
        error: 'gallerySessionId is required',
      },
      {
        body: { ...messageBody, gallerySessionId: 123 },
        error: 'gallerySessionId is required',
      },
      {
        body: { gallerySessionId: messageBody.gallerySessionId, content: messageBody.content },
        error: 'messageId is required',
      },
      {
        body: { ...messageBody, messageId: 123 },
        error: 'messageId is required',
      },
      {
        body: { gallerySessionId: messageBody.gallerySessionId, messageId: messageBody.messageId },
        error: 'content is required',
      },
      {
        body: { ...messageBody, content: { blocks: 'not-array' } },
        error: 'content is required',
      },
    ];

    await withServer(runtime, async (baseUrl) => {
      const createResponse = await fetch(`${baseUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createSessionBody()),
      });
      assert.equal(createResponse.status, 201);

      for (const testCase of cases) {
        const response = await fetch(`${baseUrl}/sessions/pi-00000000-0000-4000-8000-000000000100/messages`, {
          method: 'POST',
          headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
          body: JSON.stringify(testCase.body),
        });

        assert.equal(response.status, 400);
        assert.equal(response.headers.get('content-type'), 'application/json');
        assert.deepEqual(await response.json(), { error: testCase.error });
      }

      assert.deepEqual(runtime.calls.sendMessage, []);
    });
  });

  it('rejects message requests whose Gallery session id does not match the runner session', async () => {
    const runtime = createRuntime();

    await withServer(runtime, async (baseUrl) => {
      const createResponse = await fetch(`${baseUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createSessionBody()),
      });
      assert.equal(createResponse.status, 201);

      const response = await fetch(`${baseUrl}/sessions/pi-00000000-0000-4000-8000-000000000100/messages`, {
        method: 'POST',
        headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...messageBody,
          gallerySessionId: '00000000-0000-4000-8000-000000000999',
        }),
      });

      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: 'runner session not found' });
      assert.deepEqual(runtime.calls.sendMessage, []);
    });
  });

  it('streams runtime runner-error events', async () => {
    const runtime = createRuntime({
      async *sendMessage(body) {
        yield {
          type: 'runner-error',
          sessionId: body.gallerySessionId,
          runnerSessionId: body.runnerSessionId,
          message: 'Provider request failed',
        };
      },
    });

    await withServer(runtime, async (baseUrl) => {
      await fetch(`${baseUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createSessionBody()),
      });

      const response = await fetch(`${baseUrl}/sessions/pi-00000000-0000-4000-8000-000000000100/messages`, {
        method: 'POST',
        headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
        body: JSON.stringify(messageBody),
      });

      assert.equal(response.status, 200);
      assert.deepEqual(await readSse(response), [
        {
          event: 'runner-error',
          data: {
            type: 'runner-error',
            sessionId: '00000000-0000-4000-8000-000000000100',
            runnerSessionId: 'pi-00000000-0000-4000-8000-000000000100',
            message: 'Provider request failed',
          },
        },
      ]);
    });
  });

  it('streams a generic runner-error when runtime message streaming throws without leaking secrets', async () => {
    const runtime = createRuntime({
      async *sendMessage() {
        throw new Error('provider rejected sk-session-secret');
      },
    });

    await withServer(runtime, async (baseUrl) => {
      await fetch(`${baseUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createSessionBody()),
      });

      const response = await fetch(`${baseUrl}/sessions/pi-00000000-0000-4000-8000-000000000100/messages`, {
        method: 'POST',
        headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
        body: JSON.stringify(messageBody),
      });

      assert.equal(response.status, 200);
      const responseBody = await response.text();
      assert.equal(responseBody.includes('sk-session-secret'), false);
      assert.deepEqual(parseSse(responseBody), [
        {
          event: 'runner-error',
          data: {
            type: 'runner-error',
            sessionId: '00000000-0000-4000-8000-000000000100',
            runnerSessionId: 'pi-00000000-0000-4000-8000-000000000100',
            message: 'Runner session failed',
          },
        },
      ]);
    });
  });

  it('returns 404 for unknown routes', async () => {
    await withServer(createRuntime(), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/unknown`);

      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: 'not found' });
    });
  });
});
