/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

type PendingRequest = {
  controller: AbortController;
  responsePromise?: Promise<Response>;
  cleanupTimeout?: ReturnType<typeof setTimeout>;
};

const pendingRequests = new Map<string, PendingRequest>();

const getRequestKey = (request: URL | Request): string => (request instanceof URL ? request.href : request.url);

const CANCELATION_MESSAGE = 'Request canceled by application';
const CLEANUP_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export const handleFetch = (request: URL | Request): Promise<Response> => {
  const requestKey = getRequestKey(request);
  const existing = pendingRequests.get(requestKey);

  if (existing?.responsePromise) {
    // Clone the response since response bodies can only be read once
    // Each caller gets an independent clone they can consume
    return existing.responsePromise.then((response) => response.clone());
  }

  const pendingRequest: PendingRequest = {
    controller: new AbortController(),
    cleanupTimeout: undefined,
  };
  pendingRequests.set(requestKey, pendingRequest);

  // NOTE: fetch returns after headers received, not the body
  pendingRequest.responsePromise = fetch(request, { signal: pendingRequest.controller.signal })
    .catch((error: unknown) => {
      const standardError = error instanceof Error ? error : new Error(String(error));
      if (standardError.name === 'AbortError' || standardError.message === CANCELATION_MESSAGE) {
        // dummy response avoids network errors in the console for these requests
        return new Response(undefined, { status: 204 });
      }
      throw standardError;
    })
    .finally(() => {
      // Fetch resolves once headers arrive. Do not retain the Response for the body lifetime:
      // an unconsumed cloned body can keep proxied media streams open until their idle timeout.
      pendingRequest.responsePromise = undefined;
      const cleanupTimeout = setTimeout(() => {
        if (pendingRequests.get(requestKey) === pendingRequest) {
          pendingRequests.delete(requestKey);
        }
      }, CLEANUP_TIMEOUT_MS);
      pendingRequest.cleanupTimeout = cleanupTimeout;
    });

  return pendingRequest.responsePromise;
};

export const handleCancel = (url: URL) => {
  const requestKey = getRequestKey(url);

  const pendingRequest = pendingRequests.get(requestKey);
  if (pendingRequest) {
    pendingRequest.controller.abort(CANCELATION_MESSAGE);
    if (pendingRequest.cleanupTimeout) {
      clearTimeout(pendingRequest.cleanupTimeout);
    }
    pendingRequests.delete(requestKey);
  }
};
