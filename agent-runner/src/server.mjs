import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createPiRuntime } from './pi-runtime.mjs';

const capabilities = {
  protocolVersion: '2026-05-14',
  streaming: true,
  tools: [],
  models: [],
  runtime: 'pi',
};

const sendJson = (response, status, body) => {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
};

const readJson = async (request) => {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks).toString('utf8');
  return body.length === 0 ? {} : JSON.parse(body);
};

const readJsonOrSendError = async (request, response) => {
  try {
    return { ok: true, body: await readJson(request) };
  } catch {
    sendJson(response, 400, { error: 'invalid JSON body' });
    return { ok: false };
  }
};

const sendSse = (response, event, data) => {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
};

const validateCreateSessionBody = (body) => {
  if (typeof body?.gallerySessionId !== 'string') {
    return 'gallerySessionId is required';
  }

  if (!body.credential || typeof body.credential !== 'object') {
    return 'credential is required';
  }

  if (typeof body.credential.secret !== 'string' || body.credential.secret.length === 0) {
    return 'credential.secret is required';
  }

  if (typeof body.model !== 'string' || body.model.length === 0) {
    return 'model is required';
  }

  return undefined;
};

const normalizeRuntimeCreateSessionResponse = (runnerSession) => {
  const capabilities = runnerSession?.capabilities;
  if (
    typeof runnerSession?.runnerSessionId !== 'string' ||
    !capabilities ||
    typeof capabilities !== 'object' ||
    typeof capabilities.protocolVersion !== 'string' ||
    typeof capabilities.streaming !== 'boolean' ||
    !Array.isArray(capabilities.tools) ||
    !Array.isArray(capabilities.models)
  ) {
    throw new Error('invalid runtime session response');
  }

  const normalizedCapabilities = {
    protocolVersion: capabilities.protocolVersion,
    streaming: capabilities.streaming,
    tools: capabilities.tools,
    models: capabilities.models,
  };
  if (typeof capabilities.runtime === 'string') {
    normalizedCapabilities.runtime = capabilities.runtime;
  }

  return {
    runnerSessionId: runnerSession.runnerSessionId,
    capabilities: normalizedCapabilities,
  };
};

const validateMessageBody = (body) => {
  if (typeof body?.gallerySessionId !== 'string') {
    return 'gallerySessionId is required';
  }

  if (typeof body.messageId !== 'string') {
    return 'messageId is required';
  }

  if (!body.content || typeof body.content !== 'object' || !Array.isArray(body.content.blocks)) {
    return 'content is required';
  }

  return undefined;
};

export const startServer = ({
  port = Number(process.env.PORT ?? 4477),
  host = process.env.HOST ?? '127.0.0.1',
  runtime = createPiRuntime(),
} = {}) => {
  const runnerSessionIds = new Set();

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);

    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, { status: 'ok', version: '0.1.0', capabilities });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/sessions') {
      const result = await readJsonOrSendError(request, response);
      if (!result.ok) {
        return;
      }

      const validationError = validateCreateSessionBody(result.body);
      if (validationError) {
        sendJson(response, 400, { error: validationError });
        return;
      }

      try {
        const runnerSession = normalizeRuntimeCreateSessionResponse(await runtime.createSession(result.body));
        runnerSessionIds.add(runnerSession.runnerSessionId);
        sendJson(response, 201, runnerSession);
      } catch {
        sendJson(response, 502, { error: 'runner session creation failed' });
      }
      return;
    }

    const messageMatch = url.pathname.match(/^\/sessions\/([^/]+)\/messages$/);
    if (request.method === 'POST' && messageMatch) {
      const runnerSessionId = decodeURIComponent(messageMatch[1]);
      if (!runnerSessionIds.has(runnerSessionId)) {
        sendJson(response, 404, { error: 'runner session not found' });
        return;
      }

      const result = await readJsonOrSendError(request, response);
      if (!result.ok) {
        return;
      }

      const { body } = result;
      const validationError = validateMessageBody(body);
      if (validationError) {
        sendJson(response, 400, { error: validationError });
        return;
      }

      response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      try {
        for await (const event of runtime.sendMessage({
          runnerSessionId,
          gallerySessionId: body.gallerySessionId,
          messageId: body.messageId,
          content: body.content,
        })) {
          sendSse(response, event.type, event);
        }
      } catch {
        sendSse(response, 'runner-error', {
          type: 'runner-error',
          sessionId: body.gallerySessionId,
          runnerSessionId,
          message: 'Runner session failed',
        });
      }
      response.end();
      return;
    }

    sendJson(response, 404, { error: 'not found' });
  });

  return new Promise((resolve) => {
    server.listen(port, host, () => resolve(server));
  });
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await startServer();
  const address = server.address();
  if (address && typeof address === 'object') {
    console.log(`agent-runner listening on http://${address.address}:${address.port}`);
  }
}
