const protocolVersion = '2026-05-14';
const inaccessibleAssetId = '00000000-0000-4000-8000-000000000014';
const e2eToolNames = ['mcp:gallery'];

export const e2eCapabilities = {
  protocolVersion,
  streaming: true,
  tools: e2eToolNames,
  models: ['e2e-album-organizer'],
  runtime: 'e2e',
};

const getPromptText = (content) =>
  content?.blocks
    ?.filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim() ?? '';

const completedEvent = ({ gallerySessionId, runnerSessionId, text }) => ({
  type: 'assistant-message-completed',
  sessionId: gallerySessionId,
  runnerSessionId,
  providerMessageId: 'e2e-provider-message',
  content: { blocks: [{ type: 'text', text }] },
});

const deltaEvent = ({ gallerySessionId, runnerSessionId, text }) => ({
  type: 'assistant-message-delta',
  sessionId: gallerySessionId,
  runnerSessionId,
  delta: text,
  sequence: 1,
});

const redactGatewayToken = (message, gateway) => {
  const token = gateway?.token;
  if (!token) {
    return String(message);
  }

  return String(message).split(token).join('[redacted]');
};

const requireMcpGateway = (entry) => {
  if (!entry.mcpGateway) {
    throw new Error('The e2e runner requires a Gallery MCP gateway');
  }

  return entry.mcpGateway;
};

const extractTextContent = (result) =>
  result?.content
    ?.filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n')
    .trim() ?? '';

const parseMcpToolResult = (result, name, gateway) => {
  if (result?.isError) {
    const message = extractTextContent(result) || `MCP tool ${name} returned an error`;
    throw new Error(redactGatewayToken(message, gateway));
  }

  if (result?.structuredContent !== undefined) {
    return result.structuredContent;
  }

  const text = extractTextContent(result);
  if (text.length === 0) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(redactGatewayToken(`Invalid MCP tool result JSON for ${name}: ${message}: ${text}`, gateway));
  }
};

const compactAssetIdsFromResult = (result) => {
  const ids = [];
  const addId = (id) => {
    if (typeof id === 'string' && !ids.includes(id)) {
      ids.push(id);
    }
  };

  if (Array.isArray(result.assetIds)) {
    for (const id of result.assetIds) {
      addId(id);
    }
  }

  for (const fieldName of ['assets', 'sample']) {
    if (!Array.isArray(result[fieldName])) {
      continue;
    }

    for (const asset of result[fieldName]) {
      addId(asset?.id);
    }
  }

  return ids;
};

const createE2eMcpClient = ({ gateway, fetch: fetchImplementation = fetch }) => {
  let nextId = 1;

  return {
    async call(name, args, { signal } = {}) {
      const id = nextId++;
      const response = await fetchImplementation(gateway.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${gateway.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          method: 'tools/call',
          params: { name, arguments: args ?? {} },
        }),
        signal,
      });

      const text = await response.text();
      if (!response.ok) {
        const bodyDetails = text.length === 0 ? '' : `: ${text}`;
        throw new Error(redactGatewayToken(`Gallery MCP request failed with status ${response.status}${bodyDetails}`, gateway));
      }

      let envelope;
      try {
        envelope = text.length === 0 ? {} : JSON.parse(text);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(redactGatewayToken(`Invalid Gallery MCP JSON-RPC response: ${message}: ${text}`, gateway));
      }

      if (envelope?.error) {
        const code = envelope.error.code === undefined ? 'unknown' : envelope.error.code;
        const message = envelope.error.message ?? JSON.stringify(envelope.error);
        throw new Error(redactGatewayToken(`Gallery MCP JSON-RPC error ${code}: ${message}`, gateway));
      }

      return parseMcpToolResult(envelope?.result, name, gateway);
    },
  };
};

const requireSearchAssets = async (client) => {
  const result = await client.call('searchAssets', { filters: { isNotInAlbum: true }, limit: 3 });
  if (result.status !== 'success') {
    throw new Error(`Asset search did not complete successfully: ${result.status}`);
  }

  const assetIds = compactAssetIdsFromResult(result);
  if (assetIds.length < 2) {
    throw new Error('The e2e runner needs at least two visible loose assets');
  }

  return assetIds.slice(0, 2);
};

const proposePortugalTrip = async (client) => {
  const assetIds = await requireSearchAssets(client);
  const [coverAssetId] = assetIds;
  await client.call('proposeAlbumOperations', {
    summary: 'Create Portugal Trip and add 2 loose assets.',
    operations: [
      {
        type: 'album.create',
        summary: 'Create Portugal Trip',
        targetKind: 'new_album',
        temporaryTargetId: 'portugal-trip',
        riskLevel: 'low',
        enabled: true,
        payload: {
          albumName: 'Portugal Trip',
          description: 'Organized by the deterministic e2e assistant.',
        },
      },
      {
        type: 'album.addAssets',
        summary: 'Add selected photos to Portugal Trip',
        targetKind: 'new_album',
        temporaryTargetId: 'portugal-trip',
        assetIds,
        riskLevel: 'medium',
        enabled: true,
        payload: {},
      },
      {
        type: 'album.setCover',
        summary: 'Use first photo as Portugal Trip cover',
        targetKind: 'new_album',
        temporaryTargetId: 'portugal-trip',
        assetIds: [coverAssetId],
        riskLevel: 'low',
        enabled: true,
        payload: {},
      },
    ],
  });
};

const proposeDeniedTrip = async (client) => {
  await client.call('proposeAlbumOperations', {
    summary: 'Denied Trip would use inaccessible assets.',
    operations: [
      {
        type: 'album.create',
        summary: 'Create Denied Trip',
        targetKind: 'new_album',
        temporaryTargetId: 'denied-trip',
        riskLevel: 'low',
        enabled: true,
        payload: {
          albumName: 'Denied Trip',
          description: 'This operation plan is intentionally denied by Gallery.',
        },
      },
      {
        type: 'album.addAssets',
        summary: 'Add inaccessible photo to Denied Trip',
        targetKind: 'new_album',
        temporaryTargetId: 'denied-trip',
        assetIds: [inaccessibleAssetId],
        riskLevel: 'high',
        enabled: true,
        payload: {},
      },
    ],
  });
};

export const createE2eRuntime = ({ fetch: fetchImplementation = fetch } = {}) => {
  const sessions = new Map();

  return {
    getCapabilities() {
      return e2eCapabilities;
    },

    async createSession(body) {
      const runnerSessionId = `e2e-${body.gallerySessionId}`;
      sessions.set(runnerSessionId, {
        gallerySessionId: body.gallerySessionId,
        model: body.model,
        mcpGateway: body.mcpGateway,
      });

      return {
        runnerSessionId,
        capabilities: {
          ...e2eCapabilities,
          tools: body.mcpGateway ? e2eCapabilities.tools : [],
          models: [body.model],
        },
      };
    },

    async *sendMessage({ runnerSessionId, gallerySessionId, content }) {
      const entry = sessions.get(runnerSessionId);
      if (!entry || entry.gallerySessionId !== gallerySessionId) {
        throw new Error('Runner session not found');
      }

      const gateway = requireMcpGateway(entry);
      const client = createE2eMcpClient({
        gateway,
        fetch: fetchImplementation,
      });
      const prompt = getPromptText(content);

      yield deltaEvent({
        gallerySessionId,
        runnerSessionId,
        text: 'Drafting an album plan.',
      });

      try {
        if (/\bdenied\b|\binaccessible\b/i.test(prompt)) {
          await proposeDeniedTrip(client);
        } else {
          await proposePortugalTrip(client);
        }

        yield completedEvent({
          gallerySessionId,
          runnerSessionId,
          text: 'I proposed a Portugal Trip album. Review the operations before applying them.',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        yield completedEvent({
          gallerySessionId,
          runnerSessionId,
          text: `Gallery denied the album organization request: ${redactGatewayToken(message, gateway)}`,
        });
      }
    },
  };
};
