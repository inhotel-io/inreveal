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

const searchSelectionSourceRef = async (client, args) => {
  const result = await client.call('searchAssets', args);
  if (result.status !== 'success') {
    throw new Error(`Asset search did not complete successfully: ${result.status}`);
  }

  const sourceRef = result.selectionHandle?.sourceRef;
  if (typeof sourceRef !== 'string' || sourceRef.length === 0) {
    throw new Error('Asset search did not return a selection handle source reference');
  }

  return sourceRef;
};

const proposeMetadataBatchFromSearch = async (client, { searchArgs, action }) => {
  const sourceRef = await searchSelectionSourceRef(client, searchArgs);
  await client.call('proposeAssetBatchFromSearch', {
    action,
    assetSource: {
      kind: 'previousSearch',
      sourceRef,
    },
  });
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

const parseMetadataPrompt = (prompt) => {
  const descriptionMatch = prompt.match(
    /^set the description on the (\d+) newest photos to\s+(.+?)\.?$/i,
  );
  if (descriptionMatch) {
    return {
      kind: 'description',
      limit: Number(descriptionMatch[1]),
      description: descriptionMatch[2],
    };
  }

  const latitudeMatch = prompt.match(/\blatitude\s+(-?\d+(?:\.\d+)?)/i);
  const longitudeMatch = prompt.match(/\blongitude\s+(-?\d+(?:\.\d+)?)/i);
  if (latitudeMatch && longitudeMatch) {
    return {
      kind: 'coordinates',
      latitude: Number(latitudeMatch[1]),
      longitude: Number(longitudeMatch[1]),
    };
  }

  if (latitudeMatch) {
    return { kind: 'missing-longitude' };
  }

  if (/^set these photos to\s+.+\.?$/i.test(prompt)) {
    return { kind: 'place-name' };
  }

  return null;
};

const defaultHighlightCount = 10;
const metadataHighlightCandidateLimit = 500;
const highlightMetadataFields = ['type', 'dates', 'filename', 'favorite', 'rating', 'tags', 'location'];

const parseHighlightPrompt = (prompt) => {
  if (!/\b(best|highlights?)\b/i.test(prompt)) {
    return null;
  }

  const countMatch =
    prompt.match(/(?:^|\s)(-?\d+)\s+(?:best\s+)?(?:highlights?|photos?)\b/i) ??
    prompt.match(/\b(?:best|top|pick|choose|suggest)\s+(-?\d+)\s+(?:highlights?|photos?)\b/i);
  const requestedCount = countMatch ? Number(countMatch[1]) : null;
  const unbounded = /\b(my|entire|whole)?\s*library\b/i.test(prompt) || /\b(all photos|everything)\b/i.test(prompt);
  const bounded =
    !unbounded &&
    /\b(this album|album|space|last weekend|weekend|from|selected|selection)\b/i.test(prompt);
  const filters = /\b(last weekend|weekend)\b/i.test(prompt)
    ? {
        takenAfter: '2026-05-23T00:00:00.000Z',
        takenBefore: '2026-05-24T23:59:59.999Z',
      }
    : null;

  return {
    bounded,
    filters,
    requestedCount,
    effectiveCount: requestedCount ?? defaultHighlightCount,
    usedDefaultCount: requestedCount === null,
  };
};

const slugifyTemporaryTargetId = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'highlights';

const stripTrailingSourcePhrase = (value) =>
  value
    .replace(/\s+from\s+(?:last\s+weekend|weekend)\s*\.?$/i, '')
    .replace(/\.$/, '')
    .trim();

const extractAlbumName = (prompt) => {
  const quoted = prompt.match(/\balbum called\s+["']([^"']+)["']/i);
  if (quoted) {
    return quoted[1].trim();
  }

  const unquoted = prompt.match(/\balbum called\s+(.+?)\.?$/i);
  if (unquoted) {
    return stripTrailingSourcePhrase(unquoted[1]);
  }

  return 'Suggested Highlights';
};

const extractTargetAlbumName = (prompt) => {
  const beforeSource = prompt.match(/\bto\s+([A-Za-z][A-Za-z0-9 '&-]*?)\s+from\s+(?:last\s+weekend|weekend)\b/i);
  if (beforeSource) {
    return beforeSource[1].trim();
  }

  const match = prompt.match(/\bto\s+([A-Za-z][A-Za-z0-9 '&-]*?)\.?$/i);
  return match ? stripTrailingSourcePhrase(match[1]) : null;
};

const parseHighlightPlanIntent = (prompt) => {
  if (/\b(make|create)\b.*\balbum\b|\balbum called\b/i.test(prompt)) {
    const albumName = extractAlbumName(prompt);
    return {
      kind: 'create-album',
      albumName,
      temporaryTargetId: slugifyTemporaryTargetId(albumName),
    };
  }

  if (/\badd\b/i.test(prompt)) {
    const targetAlbumName = extractTargetAlbumName(prompt);
    return targetAlbumName ? { kind: 'add-to-album', targetAlbumName } : null;
  }

  if (/\bfavorite\b/i.test(prompt)) {
    return { kind: 'favorite' };
  }

  return null;
};

const highlightCandidateCount = (result, assetIds) => {
  if (typeof result.totalCount === 'number') {
    return result.totalCount;
  }

  if (typeof result.approximateTotal === 'number') {
    return result.approximateTotal;
  }

  if (typeof result.selectionHandle?.assetCount === 'number') {
    return result.selectionHandle.assetCount;
  }

  if (result.hasMore === true && (result.returnedCount ?? assetIds.length) >= metadataHighlightCandidateLimit) {
    return metadataHighlightCandidateLimit + 1;
  }

  if (typeof result.returnedCount === 'number') {
    return result.returnedCount;
  }

  return assetIds.length;
};

const assertMcpResultSuccess = (result, label) => {
  if (typeof result.status === 'string' && result.status !== 'success') {
    throw new Error(`${label} did not complete successfully: ${result.status}`);
  }
};

const readHighlightCandidates = async (client, highlightPrompt, limit = highlightPrompt.effectiveCount) => {
  const result = await client.call('searchAssets', {
    filters: highlightPrompt.filters,
    detail: 'ids',
    limit,
  });
  assertMcpResultSuccess(result, 'Asset search');

  const assetIds = compactAssetIdsFromResult(result);
  return {
    assetIds,
    candidateCount: highlightCandidateCount(result, assetIds),
  };
};

const readHighlightMetadata = async (client, assetIds) => {
  const result = await client.call('readAssetMetadata', {
    assetIds,
    fields: highlightMetadataFields,
  });
  assertMcpResultSuccess(result, 'Asset metadata read');

  if (!Array.isArray(result.assets)) {
    throw new Error('Asset metadata read did not return assets');
  }

  return result.assets;
};

const assetRating = (asset) => {
  const rating = asset?.exifInfo?.rating;
  return typeof rating === 'number' ? rating : 0;
};

const selectMetadataHighlights = (assets, requestedCount, excludedAssetIds = new Set()) =>
  assets
    .map((asset, index) => ({ asset, index }))
    .filter(({ asset }) => typeof asset?.id === 'string' && !excludedAssetIds.has(asset.id))
    .sort((left, right) => {
      const favoriteDelta = Number(Boolean(right.asset.isFavorite)) - Number(Boolean(left.asset.isFavorite));
      if (favoriteDelta !== 0) {
        return favoriteDelta;
      }

      const ratingDelta = assetRating(right.asset) - assetRating(left.asset);
      if (ratingDelta !== 0) {
        return ratingDelta;
      }

      return left.index - right.index;
    })
    .slice(0, requestedCount)
    .map(({ asset }) => asset.id);

const metadataCriteriaSummary =
  'metadata-only suggested highlights prioritized existing favorites, ratings, dates, tags, and location; no previews were inspected';

const proposeMetadataHighlightAlbum = async (client, intent, selectedAssetIds) => {
  await client.call('proposeAlbumOperations', {
    summary: `Create ${intent.albumName} with ${selectedAssetIds.length} ${metadataCriteriaSummary}.`,
    operations: [
      {
        type: 'album.create',
        summary: `Create ${intent.albumName}`,
        targetKind: 'new_album',
        temporaryTargetId: intent.temporaryTargetId,
        riskLevel: 'low',
        enabled: true,
        payload: {
          albumName: intent.albumName,
          description: 'Suggested highlights selected from metadata signals. No previews were inspected.',
        },
      },
      {
        type: 'album.addAssets',
        summary: `Add ${selectedAssetIds.length} metadata-only suggested highlights to ${intent.albumName}.`,
        targetKind: 'new_album',
        temporaryTargetId: intent.temporaryTargetId,
        assetIds: selectedAssetIds,
        riskLevel: 'medium',
        enabled: true,
        payload: {},
      },
    ],
  });
};

const resolveExistingAlbum = async (client, targetAlbumName) => {
  const result = await client.call('listAlbums', {});
  assertMcpResultSuccess(result, 'Album list');
  const matches = Array.isArray(result.albums)
    ? result.albums.filter((album) => album?.albumName?.toLowerCase() === targetAlbumName.toLowerCase())
    : [];

  if (matches.length !== 1) {
    return { status: 'needs-clarification', matchCount: matches.length };
  }

  const albumResult = await client.call('readAlbum', { albumId: matches[0].id });
  assertMcpResultSuccess(albumResult, 'Album read');
  return { status: 'resolved', album: albumResult.album };
};

const proposeMetadataHighlightAlbumAdd = async (client, album, selectedAssetIds) => {
  await client.call('proposeAlbumOperations', {
    summary: `Add ${selectedAssetIds.length} ${metadataCriteriaSummary} to ${album.albumName}.`,
    operations: [
      {
        type: 'album.addAssets',
        summary: `Add ${selectedAssetIds.length} metadata-only suggested highlights to ${album.albumName}.`,
        targetKind: 'existing_album',
        targetId: album.id,
        assetIds: selectedAssetIds,
        riskLevel: 'medium',
        enabled: true,
        payload: {},
      },
    ],
  });
};

const proposeMetadataHighlightFavorites = async (client, selectedAssetIds) => {
  await client.call('proposeAlbumOperations', {
    summary: `Favorite ${selectedAssetIds.length} ${metadataCriteriaSummary}.`,
    operations: [
      {
        type: 'asset.setFavorite',
        summary: `Favorite ${selectedAssetIds.length} metadata-only suggested highlights.`,
        targetKind: 'asset_batch',
        assetIds: selectedAssetIds,
        riskLevel: 'low',
        enabled: true,
        payload: { favorite: true },
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
      const metadataPrompt = parseMetadataPrompt(prompt);

      if (metadataPrompt?.kind === 'place-name') {
        yield completedEvent({
          gallerySessionId,
          runnerSessionId,
          text: 'Please provide explicit latitude and longitude before I propose a location metadata update.',
        });
        return;
      }

      if (metadataPrompt?.kind === 'missing-longitude') {
        yield completedEvent({
          gallerySessionId,
          runnerSessionId,
          text: 'Please provide the longitude before I propose a coordinate metadata update.',
        });
        return;
      }

      const highlightPrompt = parseHighlightPrompt(prompt);
      if (highlightPrompt) {
        if (!highlightPrompt.bounded) {
          yield completedEvent({
            gallerySessionId,
            runnerSessionId,
            text: 'I can suggest highlights when you give me a bounded source, such as an album, shared space, date range, search/filter, or selected photos. Which set should I use?',
          });
          return;
        }

        if (highlightPrompt.requestedCount !== null && highlightPrompt.requestedCount <= 0) {
          yield completedEvent({
            gallerySessionId,
            runnerSessionId,
            text: 'Please choose a positive count before I suggest highlights.',
          });
          return;
        }

        if (highlightPrompt.effectiveCount > metadataHighlightCandidateLimit) {
          yield completedEvent({
            gallerySessionId,
            runnerSessionId,
            text: 'Please choose 500 or fewer highlights, or narrow the source before curation.',
          });
          return;
        }

        if (!highlightPrompt.filters) {
          yield completedEvent({
            gallerySessionId,
            runnerSessionId,
            text: 'I need a concrete searchable source for this read-only highlight check, such as a date range, search/filter, or selected photos. Which set should I use?',
          });
          return;
        }

        const planIntent = parseHighlightPlanIntent(prompt);
        const planCandidateLimit = planIntent ? metadataHighlightCandidateLimit : highlightPrompt.effectiveCount;

        try {
          let targetAlbum = null;
          let existingIds = new Set();

          if (planIntent?.kind === 'add-to-album') {
            const resolution = await resolveExistingAlbum(client, planIntent.targetAlbumName);
            if (resolution.status !== 'resolved') {
              yield completedEvent({
                gallerySessionId,
                runnerSessionId,
                text: `I need one matching album named ${planIntent.targetAlbumName} before adding highlights. Which album should I use?`,
              });
              return;
            }

            targetAlbum = resolution.album;
            existingIds = new Set(Array.isArray(targetAlbum.assetIds) ? targetAlbum.assetIds : []);
          }

          const { assetIds, candidateCount } = await readHighlightCandidates(client, highlightPrompt, planCandidateLimit);
          if (candidateCount === 0) {
            yield completedEvent({
              gallerySessionId,
              runnerSessionId,
              text: 'I found no matching candidates in that bounded source, so I did not create a plan.',
            });
            return;
          }

          if (candidateCount > metadataHighlightCandidateLimit) {
            yield completedEvent({
              gallerySessionId,
              runnerSessionId,
              text: 'That source has too many candidate assets for this read-only highlight pass. Please narrow the album, space, date range, search/filter, or selected photos.',
            });
            return;
          }

          if (planIntent?.kind === 'add-to-album') {
            const metadataAssets = await readHighlightMetadata(client, assetIds);
            const selectedAssetIds = selectMetadataHighlights(metadataAssets, highlightPrompt.effectiveCount, existingIds);
            if (selectedAssetIds.length === 0) {
              yield completedEvent({
                gallerySessionId,
                runnerSessionId,
                text: `I found no eligible metadata candidates outside ${targetAlbum.albumName}, so I did not create a plan.`,
              });
              return;
            }

            await proposeMetadataHighlightAlbumAdd(client, targetAlbum, selectedAssetIds);
            const excludedCount = assetIds.filter((id) => existingIds.has(id)).length;
            const excludedText =
              excludedCount > 0 ? ` I excluded ${excludedCount} already in ${targetAlbum.albumName}.` : '';
            yield completedEvent({
              gallerySessionId,
              runnerSessionId,
              text: `I proposed ${selectedAssetIds.length} metadata-only suggested highlights for ${targetAlbum.albumName}.${excludedText} Review the plan before applying it.`,
            });
            return;
          }

          if (planIntent?.kind === 'favorite') {
            const metadataAssets = await readHighlightMetadata(client, assetIds);
            const selectedAssetIds = selectMetadataHighlights(metadataAssets, highlightPrompt.effectiveCount);
            if (selectedAssetIds.length === 0) {
              yield completedEvent({
                gallerySessionId,
                runnerSessionId,
                text: 'I found no eligible metadata candidates to favorite, so I did not create a plan.',
              });
              return;
            }

            await proposeMetadataHighlightFavorites(client, selectedAssetIds);
            yield completedEvent({
              gallerySessionId,
              runnerSessionId,
              text: `I proposed favorite operations for ${selectedAssetIds.length} metadata-only suggested highlights. Review the plan before applying it.`,
            });
            return;
          }

          if (planIntent?.kind === 'create-album') {
            const metadataAssets = await readHighlightMetadata(client, assetIds);
            const selectedAssetIds = selectMetadataHighlights(metadataAssets, highlightPrompt.effectiveCount);
            if (selectedAssetIds.length === 0) {
              yield completedEvent({
                gallerySessionId,
                runnerSessionId,
                text: 'I found no eligible metadata candidates in that bounded source, so I did not create a plan.',
              });
              return;
            }

            await proposeMetadataHighlightAlbum(client, planIntent, selectedAssetIds);
            const shortage =
              selectedAssetIds.length < highlightPrompt.effectiveCount
                ? ` Only ${selectedAssetIds.length} eligible candidates were available, though you requested ${highlightPrompt.effectiveCount}.`
                : '';
            yield completedEvent({
              gallerySessionId,
              runnerSessionId,
              text: `I proposed ${selectedAssetIds.length} suggested highlights using metadata-only criteria. Review the plan before applying it.${shortage}`,
            });
            return;
          }

          yield completedEvent({
            gallerySessionId,
            runnerSessionId,
            text: highlightPrompt.usedDefaultCount
              ? `I found ${candidateCount} candidate assets. I would use the default count of 10 for suggested highlights from this bounded source. I did not create a plan.`
              : `I found ${candidateCount} candidate assets for ${highlightPrompt.effectiveCount} suggested highlights. I did not create a plan.`,
          });
          return;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          yield completedEvent({
            gallerySessionId,
            runnerSessionId,
            text: `Gallery could not inspect highlight candidates: ${redactGatewayToken(message, gateway)}`,
          });
          return;
        }
      }

      yield deltaEvent({
        gallerySessionId,
        runnerSessionId,
        text: metadataPrompt ? 'Drafting a metadata plan.' : 'Drafting an album plan.',
      });

      try {
        if (metadataPrompt?.kind === 'description') {
          await proposeMetadataBatchFromSearch(client, {
            searchArgs: {
              filters: {},
              order: 'desc',
              limit: metadataPrompt.limit,
              detail: 'ids',
              createSelectionHandle: true,
              sampleSize: 2,
            },
            action: {
              type: 'asset.updateMetadata',
              description: metadataPrompt.description,
            },
          });
        } else if (metadataPrompt?.kind === 'coordinates') {
          await proposeMetadataBatchFromSearch(client, {
            searchArgs: {
              filters: {},
              detail: 'ids',
              createSelectionHandle: true,
              sampleSize: 2,
            },
            action: {
              type: 'asset.updateMetadata',
              latitude: metadataPrompt.latitude,
              longitude: metadataPrompt.longitude,
            },
          });
        } else if (/\bdenied\b|\binaccessible\b/i.test(prompt)) {
          await proposeDeniedTrip(client);
        } else {
          await proposePortugalTrip(client);
        }

        yield completedEvent({
          gallerySessionId,
          runnerSessionId,
          text: metadataPrompt?.kind === 'coordinates'
            ? 'I proposed a coordinates metadata update. Review the operation before applying it.'
            : metadataPrompt?.kind === 'description'
              ? 'I proposed a metadata description update. Review the operation before applying it.'
              : 'I proposed a Portugal Trip album. Review the operations before applying them.',
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
