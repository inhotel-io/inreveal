import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createWorkflowRegistry } from './registry.mjs';

// Regex-only registry (no LLM classifier) — locks in the cross-workflow routing
// precedence so a future fast-path change that introduces a collision fails here.
// LLM-mode recall is covered by the L1 eval battery.
const registry = createWorkflowRegistry();
const routeOf = async (prompt) => (await registry.classify(prompt)).kind;

const CASES = [
  // create_recent_trip_album vs create_album_from_source
  ['create an album for my recent trip to USA', 'create_recent_trip_album'],
  ['make an album for my recent trip', 'create_recent_trip_album'],
  ['make an album of my newest 50 photos', 'create_album_from_source'],
  ['create an album from my 2024 photos called Best of 2024', 'create_album_from_source'],
  ['build an album of my newest 100 photos', 'create_album_from_source'],
  // add_photos_to_album (incl. "to the X space" — a photo add, not a member op)
  ['add my newest 20 photos to Family', 'add_photos_to_album'],
  ['add my newest 20 photos to the Family space', 'add_photos_to_album'],
  ['add my Berlin photos from last weekend to the Trips album', 'add_photos_to_album'],
  // archive_assets
  ['archive my newest 50 photos', 'archive_assets'],
  ['unarchive my last 10 photos', 'archive_assets'],
  ['move my 2024 photos out of the archive', 'archive_assets'],
  // favorite_assets (incl. "add … to my favorites")
  ['favorite my newest 10 photos', 'favorite_assets'],
  ['unfavorite my last 5 photos', 'favorite_assets'],
  ['add my newest 20 photos to my favorites', 'favorite_assets'],
  // tag_assets (incl. "add the tag … to …" — not an album add)
  ['tag my newest 20 photos as Travel', 'tag_assets'],
  ['add the tag Spring Break to my newest 50 photos', 'tag_assets'],
  ['add the Travel tag to my last 10 photos', 'tag_assets'],
  // rename_or_describe_space vs rename_or_describe_album (the space-keyword gate)
  ['rename the Family space to Family 2026', 'rename_or_describe_space'],
  ['set the description on the Trips space to Our adventures', 'rename_or_describe_space'],
  ['rename the Family album to Family 2026', 'rename_or_describe_album'],
  ['set the description on my Italy album to Summer 2026', 'rename_or_describe_album'],
  // manage_space_members
  ['add Alex to the Family space as editor', 'manage_space_members'],
  ['remove Bob from the Trips space', 'manage_space_members'],
  ['add Sam and Jo to the Family space', 'manage_space_members'],
  // change_member_role
  ['make Alex an editor in Family', 'change_member_role'],
  ["change Bob's role to viewer in Trips", 'change_member_role'],
  ['make Sam a viewer in the Family space', 'change_member_role'],
  // update_asset_metadata (loose-asset metadata edits — not album or space)
  ['set the description on my newest 20 photos to Berlin', 'update_asset_metadata'],
  ['rate my newest 12 photos five stars', 'update_asset_metadata'],
  ['set the timezone on my newest 20 photos to Europe/Berlin', 'update_asset_metadata'],
  // rename_or_describe_album wins over update_asset_metadata for album refs
  ['set the description on the Family album to Summer 2026', 'rename_or_describe_album'],
  // place-name-only location edit → none (not a supported asset-metadata edit)
  ['set these photos to Paris', 'none'],
  // none (subjective / out-of-scope / chatter decline at the regex fast-path)
  ['archive the best ones', 'none'],
  ['favorite the best 3 photos from last weekend', 'none'],
  ['remove the Travel tag from my newest 20', 'none'],
  ['make an album of the best photos', 'none'],
  ['how many photos do I have?', 'none'],
  ['thanks, that looks great', 'none'],
];

describe('cross-workflow disambiguation (regex fast-path)', () => {
  for (const [prompt, kind] of CASES) {
    it(`routes "${prompt}" → ${kind}`, async () => {
      assert.equal(await routeOf(prompt), kind);
    });
  }

  it('exercises every registered workflow kind at least once', () => {
    const registeredKinds = new Set(registry.listWorkflows().map((w) => w.kind));
    const coveredKinds = new Set(CASES.map(([, kind]) => kind).filter((k) => k !== 'none'));
    for (const kind of registeredKinds) {
      assert.ok(coveredKinds.has(kind), `disambiguation table is missing a case for ${kind}`);
    }
  });
});
