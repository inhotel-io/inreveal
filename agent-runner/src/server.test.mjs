import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { startServer } from './server.mjs';

const readSse = async (response) => {
  const body = await response.text();
  return body
    .trim()
    .split('\n\n')
    .map((frame) => {
      const lines = frame.split('\n');
      const event = lines.find((line) => line.startsWith('event: '))?.slice('event: '.length);
      const data = lines.find((line) => line.startsWith('data: '))?.slice('data: '.length);
      return { event, data: data ? JSON.parse(data) : null };
    });
};

const withServer = async (test) => {
  const server = await startServer({ port: 0 });
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

describe('agent runner stub', () => {
  it('returns health capabilities', async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/health`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        status: 'ok',
        version: '0.1.0',
        capabilities: {
          protocolVersion: '2026-05-14',
          streaming: true,
          tools: ['echo'],
          models: [],
        },
      });
    });
  });

  it('creates a deterministic stub runner session', async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gallerySessionId: '00000000-0000-4000-8000-000000000100',
          credential: { label: 'OpenAI personal' },
          model: 'gpt-5.1',
          permissionPreset: 'careful',
          permissionPlan: {},
          approvalMode: 'strict',
          initialContext: {},
        }),
      });

      assert.equal(response.status, 201);
      assert.deepEqual(await response.json(), {
        runnerSessionId: 'stub-00000000-0000-4000-8000-000000000100',
        capabilities: {
          protocolVersion: '2026-05-14',
          streaming: true,
          tools: ['echo'],
          models: [],
        },
      });
    });
  });

  it('rejects session creation without a Gallery session id', async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credential: { label: 'OpenAI personal' },
          model: 'gpt-5.1',
          permissionPreset: 'careful',
          permissionPlan: {},
          approvalMode: 'strict',
          initialContext: {},
        }),
      });

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'gallerySessionId is required' });
    });
  });

  it('returns 400 for malformed session JSON', async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      });

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'invalid JSON body' });
    });
  });

  it('streams echo events for a message', async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/sessions/stub-00000000-0000-4000-8000-000000000100/messages`, {
        method: 'POST',
        headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gallerySessionId: '00000000-0000-4000-8000-000000000100',
          messageId: '00000000-0000-4000-8000-000000000200',
          content: { blocks: [{ type: 'text', text: 'Hello runner' }] },
        }),
      });

      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'text/event-stream');
      assert.deepEqual(await readSse(response), [
        {
          event: 'assistant-message-delta',
          data: {
            type: 'assistant-message-delta',
            sessionId: '00000000-0000-4000-8000-000000000100',
            runnerSessionId: 'stub-00000000-0000-4000-8000-000000000100',
            delta: 'Echo: Hello runner',
            sequence: 1,
          },
        },
        {
          event: 'assistant-message-completed',
          data: {
            type: 'assistant-message-completed',
            sessionId: '00000000-0000-4000-8000-000000000100',
            runnerSessionId: 'stub-00000000-0000-4000-8000-000000000100',
            providerMessageId: 'stub-echo-00000000-0000-4000-8000-000000000200',
            content: { blocks: [{ type: 'text', text: 'Echo: Hello runner' }] },
          },
        },
      ]);
    });
  });
});
