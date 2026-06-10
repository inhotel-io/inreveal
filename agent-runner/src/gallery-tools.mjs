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
  },
  {
    name: 'reviseProposedOperations',
    route: ({ planId }) => `revise-proposed-operations/${encodeURIComponent(planId)}`,
    label: 'Revise proposed album operations',
    description: 'Replace an existing proposed album operation plan with a new revision.',
  },
  {
    name: 'summarizePlan',
    route: ({ planId }) => `summarize-plan/${encodeURIComponent(planId)}`,
    label: 'Summarize plan',
    description: 'Summarize a stored proposed album operation plan.',
  },
];

const parameters = Type.Object({}, { additionalProperties: true });

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
      parameters,
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
