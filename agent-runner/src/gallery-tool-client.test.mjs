import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createGalleryToolClient, redactGatewayToken } from './gallery-tool-client.mjs';

const gateway = {
  url: 'https://gallery.example.test/tools/',
  token: 'gateway-token-secret',
};
const gallerySessionId = '00000000-0000-4000-8000-000000000100';

const createJsonResponse = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });

describe('Gallery tool gateway client', () => {
  it('posts to the session-scoped gateway route with a bearer token', async () => {
    const calls = [];
    const client = createGalleryToolClient({
      gateway,
      gallerySessionId,
      fetch: async (url, init) => {
        calls.push({ url, init });
        return createJsonResponse({ status: 'ok', assets: [] });
      },
    });

    const result = await client.post('search-assets', { query: 'sunset' });

    assert.deepEqual(result, { status: 'ok', assets: [] });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://gallery.example.test/tools/sessions/00000000-0000-4000-8000-000000000100/search-assets');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer gateway-token-secret');
    assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
    assert.equal(calls[0].init.body, JSON.stringify({ query: 'sunset' }));
  });

  it('redacts gateway tokens from messages', () => {
    assert.equal(
      redactGatewayToken('gateway-token-secret failed gateway-token-secret', gateway),
      '[redacted] failed [redacted]',
    );
  });

  it('passes approval-required and denied responses unchanged', async () => {
    const responses = [
      { status: 'approval-required', approvalId: 'approval-1', reason: 'Needs user approval' },
      { status: 'denied', reason: 'User denied the request' },
    ];
    const client = createGalleryToolClient({
      gateway,
      gallerySessionId,
      fetch: async () => createJsonResponse(responses.shift()),
    });

    assert.deepEqual(await client.post('read-asset-metadata', { assetIds: ['asset-1'] }), {
      status: 'approval-required',
      approvalId: 'approval-1',
      reason: 'Needs user approval',
    });
    assert.deepEqual(await client.post('read-asset-metadata', { assetIds: ['asset-1'] }), {
      status: 'denied',
      reason: 'User denied the request',
    });
  });

  it('redacts the bearer token from invalid JSON errors', async () => {
    const client = createGalleryToolClient({
      gateway,
      gallerySessionId,
      fetch: async () =>
        new Response('invalid gateway-token-secret json', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    });

    await assert.rejects(
      () => client.post('search-assets', {}),
      (error) => {
        assert.equal(error.message.includes('gateway-token-secret'), false);
        assert.match(error.message, /\[redacted\]/);
        return true;
      },
    );
  });
});
