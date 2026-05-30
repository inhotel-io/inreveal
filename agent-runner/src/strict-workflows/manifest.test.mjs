import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { WORKFLOW_MANIFEST, getWorkflowManifestEntry, listWorkflowKinds } from './manifest.mjs';

describe('strict/hybrid workflow manifest', () => {
  it('exposes unique kinds', () => {
    const kinds = listWorkflowKinds();
    assert.deepEqual(kinds, [...new Set(kinds)]);
    assert.ok(kinds.includes('create_recent_trip_album'));
  });

  it('describes create_recent_trip_album as a strict workflow with its tools', () => {
    const entry = getWorkflowManifestEntry('create_recent_trip_album');
    assert.equal(entry.flow, 'strict');
    assert.deepEqual(entry.requiredReadTools, ['findTripCandidates']);
    assert.equal(entry.planTool, 'proposeAlbumFromSelection');
    assert.equal(entry.supportsContinuation, true);
    assert.ok(entry.positiveExamples.includes('Create an album for my recent trip to USA'));
    assert.ok(entry.negativeExamples.length > 0);
    assert.equal(entry.matrixRow.capability, 'Create recent trip album');
  });

  it('requires plain-data entries with no functions', () => {
    const serialized = JSON.stringify(WORKFLOW_MANIFEST);
    assert.deepEqual(JSON.parse(serialized).length, WORKFLOW_MANIFEST.length);
    for (const entry of WORKFLOW_MANIFEST) {
      for (const value of Object.values(entry)) {
        assert.notEqual(typeof value, 'function');
      }
    }
  });

  it('returns undefined for unknown kinds', () => {
    assert.equal(getWorkflowManifestEntry('does_not_exist'), undefined);
  });

  it('matches the committed JSON mirror', () => {
    const mirrorPath = fileURLToPath(new URL('./manifest.generated.json', import.meta.url));
    const mirror = JSON.parse(readFileSync(mirrorPath, 'utf8'));
    assert.deepEqual(mirror, JSON.parse(JSON.stringify(WORKFLOW_MANIFEST)));
  });

  it('lists resolveAssetSearchFilters for every entity-source workflow', () => {
    for (const kind of ['add_photos_to_album', 'archive_assets', 'favorite_assets', 'tag_assets', 'create_album_from_source']) {
      assert.ok(getWorkflowManifestEntry(kind).requiredReadTools.includes('resolveAssetSearchFilters'), kind);
    }
  });
});
