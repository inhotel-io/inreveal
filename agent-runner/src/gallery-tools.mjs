import { defineTool } from '@earendil-works/pi-coding-agent';
import * as Type from 'typebox';

export const galleryReadToolNames = [
  'searchAssets',
  'readAssetMetadata',
  'readAssetPreviews',
  'readAssetOriginals',
  'listAlbums',
  'readAlbum',
];

export const galleryPlanningToolNames = ['proposeAlbumOperations', 'reviseProposedOperations', 'summarizePlan'];
export const galleryToolNames = [...galleryReadToolNames, ...galleryPlanningToolNames];

const uuid = Type.String({
  format: 'uuid',
  description: 'Gallery UUID.',
});
const summary = Type.String({
  minLength: 1,
  maxLength: 1000,
  description: 'Short human-readable explanation for the user review panel.',
});
const temporaryTargetId = Type.String({
  minLength: 1,
  maxLength: 120,
  pattern: '^[a-zA-Z0-9_-]+$',
  description: 'Stable identifier for a new album inside this plan, such as trip_2024.',
});
const enabled = Type.Optional(Type.Boolean({ default: true }));
const emptyPayload = Type.Optional(Type.Object({}, { additionalProperties: false }));
const assetIds = Type.Array(uuid, {
  minItems: 1,
  maxItems: 10000,
  uniqueItems: true,
  description: 'Asset ids to add or use as a cover.',
});
const stringEnum = (values, options = {}) =>
  Type.Unsafe({
    type: 'string',
    enum: values,
    ...options,
  });
const operationType = (value) => stringEnum([value]);
const targetKind = (values) => stringEnum(values);
const riskLevel = Type.Optional(stringEnum(['low', 'medium', 'high']));

const albumCreateOperation = Type.Object(
  {
    type: operationType('album.create'),
    summary,
    targetKind: targetKind(['new_album']),
    temporaryTargetId,
    riskLevel,
    enabled,
    payload: Type.Object(
      {
        albumName: Type.String({ minLength: 1, maxLength: 200 }),
        description: Type.Optional(Type.String({ maxLength: 1000, default: '' })),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

const albumAddAssetsOperation = Type.Object(
  {
    type: operationType('album.addAssets'),
    summary,
    targetKind: targetKind(['new_album', 'existing_album']),
    targetId: Type.Optional(uuid),
    temporaryTargetId: Type.Optional(temporaryTargetId),
    assetIds,
    riskLevel,
    enabled,
    payload: emptyPayload,
  },
  { additionalProperties: false },
);

const albumUpdateDetailsOperation = Type.Object(
  {
    type: operationType('album.updateDetails'),
    summary,
    targetKind: targetKind(['existing_album']),
    targetId: uuid,
    riskLevel,
    enabled,
    payload: Type.Object(
      {
        albumName: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
        description: Type.Optional(Type.String({ maxLength: 1000 })),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

const albumSetCoverOperation = Type.Object(
  {
    type: operationType('album.setCover'),
    summary,
    targetKind: targetKind(['new_album', 'existing_album']),
    targetId: Type.Optional(uuid),
    temporaryTargetId: Type.Optional(temporaryTargetId),
    assetIds: Type.Array(uuid, { minItems: 1, maxItems: 1 }),
    riskLevel,
    enabled,
    payload: emptyPayload,
  },
  { additionalProperties: false },
);

const operations = Type.Array(
  Type.Union([albumCreateOperation, albumAddAssetsOperation, albumUpdateDetailsOperation, albumSetCoverOperation]),
  {
    minItems: 1,
    maxItems: 500,
    description: 'Reviewable album operations to propose. Use album.create for empty albums.',
  },
);

const operationPlanParameters = Type.Object(
  {
    summary,
    operations,
  },
  { additionalProperties: false },
);
const reviseOperationPlanParameters = Type.Object(
  {
    planId: uuid,
    summary,
    operations,
    feedback: Type.Optional(Type.String({ minLength: 1, maxLength: 2000 })),
  },
  { additionalProperties: false },
);
const summarizePlanParameters = Type.Object(
  {
    planId: uuid,
    focus: Type.Optional(Type.String({ minLength: 1, maxLength: 1000 })),
  },
  { additionalProperties: false },
);
const permissiveParameters = Type.Object({}, { additionalProperties: true });

const toolDefinitions = [
  {
    name: 'searchAssets',
    route: 'search-assets',
    label: 'Search assets',
    description: 'Search Gallery assets visible to this session.',
  },
  {
    name: 'readAssetMetadata',
    route: 'read-asset-metadata',
    label: 'Read asset metadata',
    description: 'Read metadata for Gallery assets visible to this session.',
  },
  {
    name: 'readAssetPreviews',
    route: 'read-asset-previews',
    label: 'Read asset previews',
    description: 'Read preview references for Gallery assets visible to this session.',
  },
  {
    name: 'readAssetOriginals',
    route: 'read-asset-originals',
    label: 'Read asset originals',
    description: 'Read original asset references without downloading media bytes.',
  },
  {
    name: 'listAlbums',
    route: 'list-albums',
    label: 'List albums',
    description: 'List Gallery albums visible to this session.',
  },
  {
    name: 'readAlbum',
    route: 'read-album',
    label: 'Read album',
    description: 'Read a Gallery album visible to this session.',
  },
  {
    name: 'proposeAlbumOperations',
    route: 'propose-album-operations',
    label: 'Propose album operations',
    description: 'Store a structured album organization plan for user review without applying it.',
    parameters: operationPlanParameters,
  },
  {
    name: 'reviseProposedOperations',
    route: ({ planId }) => `revise-proposed-operations/${encodeURIComponent(planId)}`,
    label: 'Revise proposed album operations',
    description: 'Replace an existing proposed album operation plan with a new revision.',
    parameters: reviseOperationPlanParameters,
  },
  {
    name: 'summarizePlan',
    route: ({ planId }) => `summarize-plan/${encodeURIComponent(planId)}`,
    label: 'Summarize plan',
    description: 'Summarize a stored proposed album operation plan.',
    parameters: summarizePlanParameters,
  },
];

const getRouteAndBody = (tool, params) => {
  if (typeof tool.route === 'string') {
    return { route: tool.route, body: params };
  }

  if (!params || typeof params.planId !== 'string' || params.planId.length === 0) {
    throw new Error(`${tool.name} requires planId`);
  }

  const { planId: _planId, ...body } = params;
  return { route: tool.route(params), body };
};

export const createGalleryTools = ({ client }) =>
  toolDefinitions.map((tool) =>
    defineTool({
      name: tool.name,
      label: tool.label,
      description: tool.description,
      parameters: tool.parameters ?? permissiveParameters,
      async execute(_toolCallId, params, signal) {
        const { route, body } = getRouteAndBody(tool, params);
        const result = await client.post(route, body, { signal });
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          details: result,
        };
      },
    }),
  );

export const createGalleryReadTools = createGalleryTools;
