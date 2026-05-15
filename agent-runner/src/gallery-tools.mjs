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
];

const parameters = Type.Record(Type.String(), Type.Any());

export const createGalleryReadTools = ({ client }) =>
  toolDefinitions.map((tool) =>
    defineTool({
      name: tool.name,
      label: tool.label,
      description: tool.description,
      parameters,
      async execute(_toolCallId, params, signal) {
        const result = await client.post(tool.route, params, { signal });
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          details: result,
        };
      },
    }),
  );
