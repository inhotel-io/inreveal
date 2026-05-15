import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createGalleryReadTools, galleryReadToolNames } from './gallery-tools.mjs';

const expectedReadToolNames = [
  'searchAssets',
  'readAssetMetadata',
  'readAssetPreviews',
  'readAssetOriginals',
  'listAlbums',
  'readAlbum',
];

const routeByToolName = {
  searchAssets: 'search-assets',
  readAssetMetadata: 'read-asset-metadata',
  readAssetPreviews: 'read-asset-previews',
  readAssetOriginals: 'read-asset-originals',
  listAlbums: 'list-albums',
  readAlbum: 'read-album',
};

const createRecordingClient = () => {
  const calls = [];
  return {
    calls,
    async post(path, body) {
      calls.push({ path, body });
      return { status: 'ok', path, body };
    },
  };
};

describe('Gallery read tools', () => {
  it('exports only Gallery read tool names', () => {
    assert.deepEqual(galleryReadToolNames, expectedReadToolNames);
  });

  it('does not include write or album operation tools', () => {
    const forbiddenNames = ['createAlbum', 'addAssetsToAlbum', 'removeAssetsFromAlbum', 'updateAlbum', 'setAlbumCover'];

    for (const name of forbiddenNames) {
      assert.equal(galleryReadToolNames.includes(name), false);
    }
  });

  it('creates only Gallery read tools', () => {
    const tools = createGalleryReadTools({ client: createRecordingClient() });

    assert.deepEqual(
      tools.map((tool) => tool.name),
      expectedReadToolNames,
    );
  });

  it('uses object parameter schemas compatible with OpenAI function tools', () => {
    const tools = createGalleryReadTools({ client: createRecordingClient() });

    for (const tool of tools) {
      assert.equal(tool.parameters.type, 'object');
      assert.deepEqual(tool.parameters.properties, {});
      assert.equal(tool.parameters.additionalProperties, true);
      assert.equal(tool.parameters.patternProperties, undefined);
    }
  });

  it('searchAssets calls the search-assets gateway route', async () => {
    const client = createRecordingClient();
    const [tool] = createGalleryReadTools({ client }).filter((candidate) => candidate.name === 'searchAssets');

    await tool.execute('tool-call-1', { query: 'beach' });

    assert.deepEqual(client.calls, [{ path: 'search-assets', body: { query: 'beach' } }]);
  });

  it('maps every read tool to its server route and returns Pi text content with details', async () => {
    const client = createRecordingClient();
    const tools = createGalleryReadTools({ client });

    for (const tool of tools) {
      const params = { requestId: `${tool.name}-request` };
      const result = await tool.execute(`call-${tool.name}`, params);

      assert.deepEqual(client.calls.at(-1), { path: routeByToolName[tool.name], body: params });
      assert.deepEqual(result, {
        content: [{ type: 'text', text: JSON.stringify({ status: 'ok', path: routeByToolName[tool.name], body: params }) }],
        details: { status: 'ok', path: routeByToolName[tool.name], body: params },
      });
    }
  });
});
