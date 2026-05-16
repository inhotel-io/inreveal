import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createGalleryReadTools,
  createGalleryTools,
  galleryPlanningToolNames,
  galleryReadToolNames,
  galleryToolNames,
} from './gallery-tools.mjs';

const expectedReadToolNames = [
  'searchAssets',
  'readAssetMetadata',
  'readAssetPreviews',
  'readAssetOriginals',
  'listAlbums',
  'readAlbum',
];

const expectedPlanningToolNames = ['proposeAlbumOperations', 'reviseProposedOperations', 'summarizePlan'];
const expectedToolNames = [...expectedReadToolNames, ...expectedPlanningToolNames];

const routeByToolName = {
  searchAssets: 'search-assets',
  readAssetMetadata: 'read-asset-metadata',
  readAssetPreviews: 'read-asset-previews',
  readAssetOriginals: 'read-asset-originals',
  listAlbums: 'list-albums',
  readAlbum: 'read-album',
  proposeAlbumOperations: 'propose-album-operations',
  reviseProposedOperations: 'revise-proposed-operations/plan-1',
  summarizePlan: 'summarize-plan/plan-1',
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
  it('exports Gallery read and planning tool names', () => {
    assert.deepEqual(galleryReadToolNames, expectedReadToolNames);
    assert.deepEqual(galleryPlanningToolNames, expectedPlanningToolNames);
    assert.deepEqual(galleryToolNames, expectedToolNames);
  });

  it('does not include direct write or apply tools', () => {
    const forbiddenNames = [
      'createAlbum',
      'addAssetsToAlbum',
      'removeAssetsFromAlbum',
      'updateAlbum',
      'setAlbumCover',
      'applyAlbumOperations',
    ];

    for (const name of forbiddenNames) {
      assert.equal(galleryToolNames.includes(name), false);
    }
  });

  it('creates Gallery read and planning tools', () => {
    const tools = createGalleryTools({ client: createRecordingClient() });

    assert.deepEqual(
      tools.map((tool) => tool.name),
      expectedToolNames,
    );
  });

  it('keeps createGalleryReadTools as a compatibility alias for all Gallery tools', () => {
    const tools = createGalleryReadTools({ client: createRecordingClient() });

    assert.deepEqual(
      tools.map((tool) => tool.name),
      expectedToolNames,
    );
  });

  it('uses permissive object parameter schemas for read tools', () => {
    const tools = createGalleryTools({ client: createRecordingClient() });

    for (const tool of tools.filter((candidate) => expectedReadToolNames.includes(candidate.name))) {
      assert.equal(tool.parameters.type, 'object');
      assert.deepEqual(tool.parameters.properties, {});
      assert.equal(tool.parameters.additionalProperties, true);
      assert.equal(tool.parameters.patternProperties, undefined);
    }
  });

  it('uses concrete planning schemas so models can form valid operation plans', () => {
    const tools = createGalleryTools({ client: createRecordingClient() });
    const propose = tools.find((tool) => tool.name === 'proposeAlbumOperations');
    const revise = tools.find((tool) => tool.name === 'reviseProposedOperations');
    const summarize = tools.find((tool) => tool.name === 'summarizePlan');

    assert.deepEqual(propose.parameters.required, ['summary', 'operations']);
    assert.deepEqual(revise.parameters.required, ['planId', 'summary', 'operations']);
    assert.deepEqual(summarize.parameters.required, ['planId']);
    assert.equal(propose.parameters.additionalProperties, false);
    assert.equal(revise.parameters.additionalProperties, false);
    assert.equal(summarize.parameters.additionalProperties, false);
    assert.equal(propose.parameters.properties.operations.type, 'array');
    assert.equal(propose.parameters.properties.operations.items.anyOf.length, 4);
    assert.equal(
      propose.parameters.properties.operations.items.anyOf.some((operation) =>
        operation.properties.type.enum.includes('album.create'),
      ),
      true,
    );
    assert.deepEqual(
      propose.parameters.properties.operations.items.anyOf.find(
        (operation) => operation.properties.type.enum.includes('album.create'),
      ).required,
      ['type', 'summary', 'targetKind', 'temporaryTargetId', 'payload'],
    );
    assert.deepEqual(
      propose.parameters.properties.operations.items.anyOf.find((operation) =>
        operation.properties.type.enum.includes('album.create'),
      ).properties.targetKind.enum,
      ['new_album'],
    );
    assert.deepEqual(
      propose.parameters.properties.operations.items.anyOf
        .find((operation) => operation.properties.type.enum.includes('album.create'))
        .properties.payload.required,
      ['albumName'],
    );
  });

  it('searchAssets calls the search-assets gateway route', async () => {
    const client = createRecordingClient();
    const [tool] = createGalleryTools({ client }).filter((candidate) => candidate.name === 'searchAssets');

    await tool.execute('tool-call-1', { query: 'beach' });

    assert.deepEqual(client.calls, [{ path: 'search-assets', body: { query: 'beach' } }]);
  });

  it('maps every read tool to its server route and returns Pi text content with details', async () => {
    const client = createRecordingClient();
    const tools = createGalleryTools({ client });

    for (const tool of tools.filter((candidate) => expectedReadToolNames.includes(candidate.name))) {
      const params = { requestId: `${tool.name}-request` };
      const result = await tool.execute(`call-${tool.name}`, params);

      assert.deepEqual(client.calls.at(-1), { path: routeByToolName[tool.name], body: params });
      assert.deepEqual(result, {
        content: [{ type: 'text', text: JSON.stringify({ status: 'ok', path: routeByToolName[tool.name], body: params }) }],
        details: { status: 'ok', path: routeByToolName[tool.name], body: params },
      });
    }
  });

  it('maps planning tools to plan-aware gateway routes', async () => {
    const client = createRecordingClient();
    const tools = createGalleryTools({ client });
    const propose = tools.find((tool) => tool.name === 'proposeAlbumOperations');
    const revise = tools.find((tool) => tool.name === 'reviseProposedOperations');
    const summarize = tools.find((tool) => tool.name === 'summarizePlan');

    await propose.execute('call-propose', { operations: [], summary: 'Initial' });
    await revise.execute('call-revise', { planId: 'plan-1', operations: [], summary: 'Revision' });
    await summarize.execute('call-summary', { planId: 'plan-1', focus: 'risk' });

    assert.deepEqual(client.calls.at(-3), {
      path: 'propose-album-operations',
      body: { operations: [], summary: 'Initial' },
    });
    assert.deepEqual(client.calls.at(-2), {
      path: 'revise-proposed-operations/plan-1',
      body: { operations: [], summary: 'Revision' },
    });
    assert.deepEqual(client.calls.at(-1), {
      path: 'summarize-plan/plan-1',
      body: { focus: 'risk' },
    });
  });

  it('URL-encodes plan ids for planning routes', async () => {
    const client = createRecordingClient();
    const revise = createGalleryTools({ client }).find((tool) => tool.name === 'reviseProposedOperations');

    await revise.execute('call-revise', { planId: 'plan 1/with slash', operations: [] });

    assert.equal(client.calls.at(-1).path, 'revise-proposed-operations/plan%201%2Fwith%20slash');
    assert.deepEqual(client.calls.at(-1).body, { operations: [] });
  });

  it('requires planId for plan-aware tools', async () => {
    const tools = createGalleryTools({ client: createRecordingClient() });
    const revise = tools.find((tool) => tool.name === 'reviseProposedOperations');
    const summarize = tools.find((tool) => tool.name === 'summarizePlan');

    await assert.rejects(() => revise.execute('call-revise', { operations: [] }), /reviseProposedOperations requires planId/);
    await assert.rejects(() => revise.execute('call-revise', { planId: '', operations: [] }), /reviseProposedOperations requires planId/);
    await assert.rejects(() => summarize.execute('call-summary', { focus: 'risk' }), /summarizePlan requires planId/);
    await assert.rejects(() => summarize.execute('call-summary', { planId: '', focus: 'risk' }), /summarizePlan requires planId/);
  });
});
