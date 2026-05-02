import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const requestUrl = 'https://gallery.example/api/assets/00000000-0000-4000-8000-000000000001/thumbnail';

const loadRequestModule = async () => {
  vi.resetModules();
  return await import('./request');
};

describe('service worker asset request handling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns the original response for the first request without cloning an unconsumed body', async () => {
    const { handleFetch } = await loadRequestModule();
    const response = new Response('thumbnail');
    const clone = vi.spyOn(response, 'clone');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    await expect(handleFetch(new Request(requestUrl))).resolves.toBe(response);

    expect(clone).not.toHaveBeenCalled();
  });

  it('starts a fresh fetch after the first response has started instead of reusing its body for five minutes', async () => {
    const { handleFetch } = await loadRequestModule();
    const firstResponse = new Response('first');
    const secondResponse = new Response('second');
    const fetch = vi.fn().mockResolvedValueOnce(firstResponse).mockResolvedValueOnce(secondResponse);
    vi.stubGlobal('fetch', fetch);

    await expect(handleFetch(new Request(requestUrl))).resolves.toBe(firstResponse);
    await expect(handleFetch(new Request(requestUrl))).resolves.toBe(secondResponse);

    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
