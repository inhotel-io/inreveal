// Contract-faithful fake MCP client for strict-workflow L2 tests.
//
// It enforces the SAME shape constraints the real Gallery server tools enforce
// (mirroring server/src/dtos/agent-tool.dto.ts + agent-operation.dto.ts), so a
// call the live server would reject also throws here. This exists because the
// `add_photos_to_album` recency bug shipped past a fixture that ignored call
// args — the workflow sent a free-text `query` to tools that reject it and never
// planned live. Every strict-workflow `run()` test drives its workflow against
// this client so that class of bug fails in unit tests, not only on L3.

// Reviewable operation types accepted by proposeAlbumOperations (the full
// AgentGalleryOperationInput union: album.* + space.* + asset.*).
export const KNOWN_OPERATION_TYPES = new Set([
  'album.create',
  'album.addAssets',
  'album.removeAssets',
  'album.updateDetails',
  'album.setCover',
  'space.create',
  'space.addAssets',
  'space.removeAssets',
  'space.updateDetails',
  'space.addMembers',
  'space.removeMembers',
  'space.updateMemberRole',
  'asset.rotate',
  'asset.setFavorite',
  'asset.setArchive',
  'asset.updateMetadata',
  'asset.addTag',
  'asset.removeTag',
]);

// Action types accepted by proposeAssetBatchFromSelection's discriminated union.
export const KNOWN_BATCH_ACTION_TYPES = new Set([
  'asset.setFavorite',
  'asset.setArchive',
  'asset.addTag',
  'asset.rotate',
  'asset.updateMetadata',
]);

const SEARCH_DETAILS = new Set(['ids', 'handle', 'summary', 'metadata']);
const SEARCH_TEXT_MODES = new Set(['smart', 'description', 'ocr', 'filename']);

const fail = (message) => {
  throw new Error(message);
};

// Validate proposeAssetBatchFromSelection.action against the real union shape.
const validateBatchAction = (action) => {
  if (!action || typeof action !== 'object') fail('action is required');
  const { type } = action;
  if (!KNOWN_BATCH_ACTION_TYPES.has(type)) fail(`unknown batch action type "${type}"`);
  if (type === 'asset.setFavorite' && typeof action.favorite !== 'boolean') fail('setFavorite requires favorite:boolean');
  if (type === 'asset.setArchive' && typeof action.archived !== 'boolean') fail('setArchive requires archived:boolean');
  if (type === 'asset.addTag') {
    const provided = Number(action.tagName !== undefined) + Number(action.tagId !== undefined);
    if (provided !== 1) fail('asset.addTag requires exactly one of tagName or tagId');
  }
};

const validateOperations = (operations) => {
  if (!Array.isArray(operations) || operations.length === 0) fail('operations must be a non-empty array');
  for (const op of operations) {
    if (!op || !KNOWN_OPERATION_TYPES.has(op.type)) fail(`unknown operation type "${op?.type}"`);
  }
};

const validateSearchAssets = (args) => {
  const mode = args.mode ?? 'metadata';
  if (!SEARCH_TEXT_MODES.has(mode) && args.query !== undefined) {
    fail(`query is only supported for smart/description/ocr/filename modes (mode=${mode}, e.g. metadata)`);
  }
  if (args.detail !== undefined && !SEARCH_DETAILS.has(args.detail)) fail(`invalid searchAssets detail "${args.detail}"`);
};

const ok = (config) => config.planResult ?? { status: 'success', plan: { id: 'plan-1' } };

/**
 * Build a contract-faithful fake MCP client.
 * @param config.albums            albums returned by listAlbums
 * @param config.spaces            spaces (each may carry `members`) for listSpaces/readSpace
 * @param config.users            users returned by searchUsers
 * @param config.handleAssetCount  assetCount on the searchAssets selection handle
 * @param config.planResult        override for the propose* tool results
 */
export const makeContractClient = (config = {}) => {
  const {
    albums = [{ id: 'alb-1', albumName: 'Family' }],
    spaces = [{ id: 'spc-1', name: 'Family', members: [] }],
    users = [{ id: 'usr-1', name: 'Alex', email: 'alex@example.com' }],
    handleAssetCount = 20,
  } = config;
  const calls = [];

  const handlers = {
    listAlbums: () => ({ albums }),
    listSpaces: () => ({ spaces: spaces.map(({ members, ...summary }) => summary) }),
    readSpace: (args) => {
      const space = spaces.find((candidate) => candidate.id === args?.spaceId);
      if (!space) fail(`space not found: ${args?.spaceId}`);
      return { ...space, members: space.members ?? [] };
    },
    searchUsers: () => ({ users }),
    resolveAssetSearchFilters: (args) => {
      if (args && 'query' in args) fail("resolveAssetSearchFilters: unrecognized key 'query'");
      return { resolvedFilters: {} };
    },
    searchAssets: (args) => {
      validateSearchAssets(args ?? {});
      return { selectionHandle: { id: 'handle-1', assetCount: handleAssetCount } };
    },
    proposeAssetBatchFromSelection: (args) => {
      validateBatchAction(args?.action);
      if (!args?.selectionHandleId) fail('proposeAssetBatchFromSelection requires selectionHandleId');
      return ok(config);
    },
    proposeAlbumOperations: (args) => {
      validateOperations(args?.operations);
      return ok(config);
    },
    proposeAlbumFromSelection: (args) => {
      if (!args?.albumName) fail('proposeAlbumFromSelection requires albumName');
      if (!args?.selectionHandleId) fail('proposeAlbumFromSelection requires selectionHandleId');
      return ok(config);
    },
  };

  return {
    calls,
    async call(name, args) {
      calls.push({ name, args });
      const handler = handlers[name];
      if (!handler) fail(`unexpected tool call: ${name}`);
      return handler(args);
    },
  };
};
