import { createGalleryToolClient, redactGatewayToken } from './gallery-tool-client.mjs';
import { galleryToolNames } from './gallery-tools.mjs';

const protocolVersion = '2026-05-14';
const inaccessibleAssetId = '00000000-0000-4000-8000-000000000014';

export const e2eCapabilities = {
  protocolVersion,
  streaming: true,
  tools: galleryToolNames,
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

const requireGateway = (entry) => {
  if (!entry.toolGateway) {
    throw new Error('The e2e runner requires a Gallery tool gateway');
  }

  return entry.toolGateway;
};

const requireSearchAssets = async (client) => {
  const result = await client.post('search-assets', { filters: { isNotInAlbum: true }, limit: 3 });
  if (result.status !== 'success') {
    throw new Error(`Asset search did not complete successfully: ${result.status}`);
  }

  const assets = Array.isArray(result.assets) ? result.assets : [];
  if (assets.length < 2) {
    throw new Error('The e2e runner needs at least two visible loose assets');
  }

  return assets.slice(0, 2).map((asset) => asset.id);
};

const proposePortugalTrip = async (client) => {
  const assetIds = await requireSearchAssets(client);
  const [coverAssetId] = assetIds;
  await client.post('propose-album-operations', {
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
  await client.post('propose-album-operations', {
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
        toolGateway: body.toolGateway,
      });

      return {
        runnerSessionId,
        capabilities: {
          ...e2eCapabilities,
          tools: body.toolGateway ? e2eCapabilities.tools : [],
          models: [body.model],
        },
      };
    },

    async *sendMessage({ runnerSessionId, gallerySessionId, content }) {
      const entry = sessions.get(runnerSessionId);
      if (!entry || entry.gallerySessionId !== gallerySessionId) {
        throw new Error('Runner session not found');
      }

      const gateway = requireGateway(entry);
      const client = createGalleryToolClient({
        gateway,
        gallerySessionId,
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
