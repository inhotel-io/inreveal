import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

const capabilities = {
  protocolVersion: '2026-05-14',
  streaming: true,
  tools: ['echo'],
  models: [],
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

const firstTextBlock = (content) => {
  const block = content?.blocks?.find((item) => item?.type === 'text' && typeof item.text === 'string');
  return block?.text ?? '';
};

const sendSse = (response, event, data) => {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
};

export const startServer = ({
  port = Number(process.env.PORT ?? 4477),
  host = process.env.HOST ?? '127.0.0.1',
} = {}) => {
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
      const { body } = result;
      if (typeof body?.gallerySessionId !== 'string') {
        sendJson(response, 400, { error: 'gallerySessionId is required' });
        return;
      }

      sendJson(response, 201, {
        runnerSessionId: `stub-${body.gallerySessionId}`,
        capabilities,
      });
      return;
    }

    const messageMatch = url.pathname.match(/^\/sessions\/([^/]+)\/messages$/);
    if (request.method === 'POST' && messageMatch) {
      const result = await readJsonOrSendError(request, response);
      if (!result.ok) {
        return;
      }
      const { body } = result;
      const runnerSessionId = decodeURIComponent(messageMatch[1]);
      const text = firstTextBlock(body.content);
      const echo = `Echo: ${text}`;

      response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      sendSse(response, 'assistant-message-delta', {
        type: 'assistant-message-delta',
        sessionId: body.gallerySessionId,
        runnerSessionId,
        delta: echo,
        sequence: 1,
      });
      sendSse(response, 'assistant-message-completed', {
        type: 'assistant-message-completed',
        sessionId: body.gallerySessionId,
        runnerSessionId,
        providerMessageId: `stub-echo-${body.messageId}`,
        content: { blocks: [{ type: 'text', text: echo }] },
      });
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
