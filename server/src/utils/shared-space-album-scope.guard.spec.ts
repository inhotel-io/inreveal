// Slice 4 — backstop guard (spec §2.5). The recurring space-album defect class is
// "a 3-path access-scoping branch gains a shared_space_library arm but forgets the
// shared_space_album arm" (the historical F1 bug). This test scans every scoping
// file and asserts that each shared_space_library scoping reference has a nearby
// linked-album marker — either raw `shared_space_album` OR a call to one of the
// fork-owned album-scope helpers. It fires on any future clone (fork or upstream
// rebase) that omits the album leg.
//
// Benign non-scope references (CRUD, column lists, library-only sync helpers) are
// filtered by pattern; genuine non-3-path sites are named in ALLOWLIST with a
// reason. Two ALLOWLIST entries are GAPS this very guard discovered — see below.
//
// Slice 11 adds a SECOND, INDEPENDENT scan (at the bottom): every space asset
// read must reference the visibility gate. The two scans share the same file list
// but have separate allowlists so neither pollutes the other's invariant.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Server root — vitest runs with cwd at server/ (matches face-identity-query-shape.spec.ts).
const SERVER_ROOT = process.cwd();

const SCOPING_FILES = [
  'src/repositories/shared-space.repository.ts',
  'src/repositories/sync.repository.ts',
  'src/repositories/face-identity.repository.ts',
  'src/repositories/search.repository.ts',
  'src/repositories/asset.repository.ts',
  'src/repositories/access.repository.ts',
  'src/utils/database.ts',
  'src/repositories/map.repository.ts',
  'src/repositories/view-repository.ts',
  'src/repositories/memory.repository.ts',
  'src/repositories/tag.repository.ts',
  'src/repositories/download.repository.ts',
];

// A shared_space_library reference has "album coverage" if any of these appear
// within +-WINDOW lines: the raw album table, or a fork album-scope helper call.
const ALBUM_MARKER =
  /shared_space_album|spaceAlbumAssetExists|spaceAssetPathBranches|spaceAlbumAssetExistsSql|accessibleSpaceAlbums/;
const LIBRARY_REF = /\bshared_space_library\b/;
const WINDOW = 45;

// Lines that reference shared_space_library but are NOT a 3-path access-scope arm.
const BENIGN_LINE = [
  /(insertInto|deleteFrom|updateTable|backfillQuery)\(\s*['"]shared_space_library/, // CRUD / sync backfill
  /^'shared_space_library\.\w+',?$/, // column-list entry
  /accessibleLibraries|library_user|library_asset|library_audit/, // library-only sync helpers
];

// Enclosing functions that legitimately reference shared_space_library WITHOUT an
// album arm. Keyed by function name (robust to line drift). Every entry needs a reason.
const ALLOWLIST: Record<string, string> = {
  // Album-ABSENCE gate (keeps plain non-space album assets visible) — references
  // asset/library absence by design, never an album access arm.
  albumSharedSpaceScope: 'album-absence gate, not an album access arm',
  // Pre-existing intentional RBAC gap: AssetUpdate/edit has no space-album arm
  // (space editors can add/remove but not metadata-edit linked-album assets). Out
  // of scope for this behavior-preserving consolidation; tracked separately.
  checkSpaceEditAccess: 'known RBAC gap: AssetUpdate has no space-album arm (pre-existing)',
  // NOTE: map.repository.ts:getMapMarkers was fixed by Slice 9. The space-specific
  // getMapMarkers in shared-space.repository.ts (GET /shared-spaces/:id/map-markers)
  // still lacks the album arm — pre-existing gap, tracked separately.
  getMapMarkers: 'GUARD-DISCOVERED gap: union(direct,library) omits album arm (pre-existing, follow-up)',
  // GUARD-DISCOVERED pre-existing missing-album gaps (not in the review's inventory,
  // which only grepped shared_space_album). Both OR direct+library but omit the
  // album arm, so an album-only asset is invisible to them. Flagged for follow-up;
  // NOT fixed here (unplanned behavior change).
  findSpaceForAssetAndUser: 'GUARD-DISCOVERED gap: union(direct,library) omits album arm (pre-existing, follow-up)',
  getPersonalThumbnailForSpacePerson:
    'GUARD-DISCOVERED gap: or(direct,library) omits album arm (pre-existing, follow-up)',
};

const DECL = /^\s*(?:export\s+)?(?:async\s+)?(?:function\s+)?([A-Za-z0-9_]+)\s*[(<]/;
const NON_DECL = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'return',
  'eb',
  'qb',
  'join',
  'map',
  'filter',
  'forEach',
  'then',
  // SQL keywords that appear as the first token in raw sql`` template literal lines
  // and would otherwise be misidentified as TypeScript function names by DECL.
  'AND',
  'OR',
  'FROM',
  'WHERE',
  'INNER',
  'LEFT',
  'RIGHT',
  'UNION',
  'SELECT',
  'ON',
  'WITH',
  'GROUP',
  'HAVING',
  'ORDER',
  'LIMIT',
  'OFFSET',
  'NOT',
  'IN',
  'AS',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
]);

const enclosingFn = (lines: string[], i: number): string => {
  for (let j = i; j >= 0; j--) {
    const m = DECL.exec(lines[j]);
    if (m && !NON_DECL.has(m[1])) {
      return m[1];
    }
  }
  return '<module>';
};

describe('space-album scope guard: every library scoping arm has album coverage', () => {
  it.each(SCOPING_FILES)('%s', (file) => {
    const lines = readFileSync(join(SERVER_ROOT, file), 'utf8').split('\n');
    const orphans: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const trimmed = raw.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) {
        continue;
      }
      if (!LIBRARY_REF.test(raw)) {
        continue;
      }
      if (BENIGN_LINE.some((re) => re.test(trimmed))) {
        continue;
      }
      const fn = enclosingFn(lines, i);
      if (ALLOWLIST[fn]) {
        continue;
      }
      const lo = Math.max(0, i - WINDOW);
      const hi = Math.min(lines.length, i + WINDOW + 1);
      const covered = lines.slice(lo, hi).some((l) => ALBUM_MARKER.test(l));
      if (!covered) {
        orphans.push(`${file}:${i + 1} (in ${fn}): ${trimmed.slice(0, 90)}`);
      }
    }

    expect(
      orphans,
      `shared_space_library scoping arm(s) with no adjacent shared_space_album arm/helper.\n` +
        `Add the album leg (route it through spaceAlbumAssetExists / spaceAssetPathBranches /\n` +
        `spaceAlbumAssetExistsSql) or, if genuinely album-free, add the enclosing function to\n` +
        `ALLOWLIST with a reason.\n` +
        orphans.join('\n'),
    ).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCAN 2 (Slice 11): VISIBILITY-GATE scan
//
// Every repository query that space-scopes an asset read (joins
// shared_space_asset / shared_space_library / shared_space_album and
// selects / returns asset rows) must reference the visibility gate — either:
//   - spaceVisibilityGate (most surfaces)
//   - spaceVisibleAssetVisibilities / visibleSpaceAssetVisibilities (shared-space repo)
//   - peopleAssetVisibilities (people stats)
//   - AssetVisibility.Timeline or AssetVisibility.Archive (tighter gates: map, memory, view)
//
// The scan looks for any line containing `shared_space_asset`, `shared_space_library`,
// or `shared_space_album` (excluding comments and benign CRUD) and verifies that
// the enclosing function has at least one visibility-gate token within ±WINDOW lines.
//
// This scan uses its OWN separate allowlist — do NOT merge with ALLOWLIST above.
// ─────────────────────────────────────────────────────────────────────────────

// A space scoping reference (asset read, not CRUD) is "visibility-gated" if any
// of these tokens appear within ±VIS_WINDOW lines of it.
//
// The last two alternatives cover sync stream classes that select from a LINK
// table (shared_space_library / shared_space_album) to stream metadata rows —
// NOT asset rows. The presence of *_SYNC_COLUMNS (which contain only link-table
// columns like libraryId, spaceId, showInTimeline) confirms the query is a
// link-metadata stream and NOT an asset read. Asset visibility is enforced in
// the corresponding asset-specific stream classes (SharedSpaceAssetSync etc.).
const VIS_GATE_MARKER =
  /spaceVisibilityGate|spaceVisibleAssetVisibilities|visibleSpaceAssetVisibilities|peopleAssetVisibilities|AssetVisibility\.Timeline|AssetVisibility\.Archive|SHARED_SPACE_LIBRARY_SYNC_COLUMNS|SHARED_SPACE_ALBUM_SYNC_COLUMNS|visibilityFilter/;

// Lines that reference shared_space_* but are NOT asset-read scoping arms
// (mirrors the album-leg BENIGN_LINE filter, plus shared_space_album CRUD).
const VIS_BENIGN_LINE = [
  /(insertInto|deleteFrom|updateTable|backfillQuery)\(\s*['"]shared_space/, // CRUD / sync backfill
  /^'shared_space[^']+\.\w+',?$/, // column-list entry
  /accessibleLibraries|library_user|library_asset|library_audit/, // library-only sync helpers
  /accessibleSpaceAlbums|accessibleSpaces/, // helper call references (not inline scoping)
  /shared_space_member/, // membership-only references (not asset-read arms)
  /shared_space_audit|shared_space_person|shared_space_library_audit/, // audit/person tables
  // SharedSpaceLibrarySync / SharedSpaceAlbumLinkSync: these stream link-table rows
  // (libraryId/albumId/spaceId metadata), NOT asset rows. The backfill/upsert queries
  // select from the link table directly. Asset visibility is enforced in the separate
  // SharedSpaceAssetSync / SharedSpaceAlbumAssetSync stream classes.
  /SHARED_SPACE_LIBRARY_SYNC_COLUMNS|SHARED_SPACE_ALBUM_SYNC_COLUMNS/, // link-table column sets
];

// Scoping references that legitimately have no nearby visibility gate, keyed by
// enclosing function name. Add here with a one-line reason ONLY.
const VIS_ALLOWLIST: Record<string, string> = {
  // Returns a boolean (is asset in space?), not a full asset row set.
  // Gated upstream by checkSpaceAccess before any asset data is served.
  isAssetInSpace: 'membership-presence check only; no asset data returned; gated upstream',
  // Returns user/space metadata (who can edit?), not asset rows.
  // Visibility-gated (Slice 10) but no album arm — on album-leg ALLOWLIST.
  checkSpaceEditAccess: 'visibility-gated (Slice 10) via spaceVisibilityGate; on album-leg allowlist',
  // Absence-gate (confirms asset is NOT already in space via another path).
  // Reads album/library/direct rows to check absence, not to return asset data to client.
  albumSharedSpaceScope: 'absence gate; checks non-membership, not asset data exposure',
  // Returns space-person linked to a global person, not asset rows.
  findSpacePersonByLinkedPersonId: 'returns space-person metadata, not asset rows',
  // Union absence check for removeAssets — checks existing space membership.
  getAssetIdsWithoutOtherSpacePath: 'membership check for removals; no asset data returned to client',
  getAlbumAssetIdsWithoutOtherSpacePath: 'membership check for removals; no asset data returned to client',
  // Returns the libraryId of a linked library, not asset rows.
  getLinkedLibraries: 'returns library metadata, not asset rows',
  // Returns space-level statistics (member counts, etc.), not asset rows.
  getSpaceStats: 'space-level statistics; no asset rows returned',
  // findSpaceForAssetAndUser: membership lookup returning space/role metadata.
  // GUARD-DISCOVERED gap on album-leg allowlist; visibility gated upstream.
  findSpaceForAssetAndUser: 'membership lookup; returns space/role, not asset data; visibility gated upstream',
  // getPersonalThumbnailForSpacePerson: returns thumbnail face metadata (one face),
  // not a user-visible asset set. GUARD-DISCOVERED gap on album-leg allowlist.
  getPersonalThumbnailForSpacePerson: 'returns face thumbnail path, not a user-visible asset set; gated upstream',
  // Sync backfill helpers: operate on shared_space_{member,audit} tables as part
  // of the sync protocol, not as direct asset-read scoping. Asset visibility is
  // enforced in the asset-specific sync streams (SharedSpaceAssetSync etc.).
  backfillQuery: 'sync infrastructure; asset visibility enforced in stream classes',
  upsertQuery: 'sync infrastructure; asset visibility enforced in stream classes',
  auditQuery: 'sync audit query; no asset rows returned',
  // Cleanup helpers that delete memory_asset rows based on visibility — the
  // AssetVisibility.Timeline check IS the deletion criterion, not a read gate.
  cleanup: 'memory cleanup; AssetVisibility.Timeline used as deletion criterion, not a read gate',
  // Returns library IDs (not asset rows) accessible to the user via owned or space-linked libraries.
  accessibleLibraries: 'returns library IDs only, not asset rows; visibility enforced in asset-stream queries',
  // Streams shared_space_library LINK rows (libraryId, spaceId metadata), NOT asset rows.
  // Asset visibility is enforced in SharedSpaceAssetExifSync and LibraryAssetSync.
  SharedSpaceLibrarySync: 'streams library-link metadata rows, not asset rows; visibility in asset streams',
  // Streams shared_space_album LINK rows (albumId, spaceId, showInTimeline), NOT asset rows.
  // Asset visibility is enforced in SharedSpaceAlbumAssetSync and SharedSpaceAlbumAssetExifSync.
  SharedSpaceAlbumLinkSync: 'streams album-link metadata rows, not asset rows; visibility in asset streams',
  // Returns album IDs (not asset rows) that a user can edit/read via a space link.
  // Actual asset visibility is enforced downstream when the album download happens.
  checkSpaceLinkedAlbumAccess: 'returns album IDs only, not asset rows; asset visibility enforced downstream',
  checkSpaceLinkedAlbumReadAccess: 'returns album IDs only, not asset rows; asset visibility enforced downstream',
  // Returns addedById (user IDs) for who added a face to the space — not asset data.
  getSpacePersonAssetAdderIds: 'returns addedById attribution (user IDs), not asset data',
  // Returns addedById for who added a specific asset to the space (via direct/library/album).
  // Selects only shared_space_{asset,library,album}.addedById — no asset content exposed.
  getSpaceAssetAdder: 'returns addedById attribution only; no asset content returned to client',
  // Returns (spaceId, albumId, showInTimeline, faceRecognitionEnabled) link metadata.
  // Used for fan-out to find which spaces a linked album feeds — no asset rows returned.
  getSpacesLinkedToAlbum: 'returns space-album link metadata (spaceId, albumId, flags), not asset rows',
  // Returns album metadata rows (albumName, thumbnailAssetId, etc.) for albums linked to
  // a space — used for management UI listing. Does NOT return individual asset content.
  getLinkedAlbums: 'returns album metadata rows for management UI; no individual asset content',
  // Returns a boolean (does this space-library link exist?), not asset rows.
  hasLibraryLink: 'boolean membership check; returns true/false, not asset data',
  // Reads shared_space_asset rows to INSERT them into shared_space_asset_audit —
  // this is write infrastructure for the visibility-purge sync mechanism, not
  // a client-facing asset read. Asset data is never returned to callers.
  emitDirectAssetVisibilityPurge:
    'sync purge infrastructure; inserts into audit table, no asset data returned to client',
  // Returns library-link metadata rows (spaceId, libraryId, faceRecognitionEnabled)
  // for fan-out to find which spaces a library feeds. No asset content exposed.
  getSpacesLinkedToLibrary: 'returns library-link metadata (spaceId, libraryId, flags), not asset rows',
};

const SPACE_ASSET_REF = /\bshared_space_asset\b|\bshared_space_library\b|\bshared_space_album\b/;
const VIS_WINDOW = 50;

describe('space-visibility gate guard: every space asset read has a visibility gate', () => {
  it.each(SCOPING_FILES)('%s', (file) => {
    const lines = readFileSync(join(SERVER_ROOT, file), 'utf8').split('\n');
    const orphans: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const trimmed = raw.trim();

      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) {
        continue;
      }
      // Skip non-space-scoping lines
      if (!SPACE_ASSET_REF.test(raw)) {
        continue;
      }
      // Skip benign CRUD / non-read-scoping lines
      if (VIS_BENIGN_LINE.some((re) => re.test(trimmed))) {
        continue;
      }

      const fn = enclosingFn(lines, i);
      if (VIS_ALLOWLIST[fn]) {
        continue;
      }

      const lo = Math.max(0, i - VIS_WINDOW);
      const hi = Math.min(lines.length, i + VIS_WINDOW + 1);
      const covered = lines.slice(lo, hi).some((l) => VIS_GATE_MARKER.test(l));
      if (!covered) {
        orphans.push(`${file}:${i + 1} (in ${fn}): ${trimmed.slice(0, 90)}`);
      }
    }

    expect(
      orphans,
      `space asset read arm(s) with no nearby visibility gate.\n` +
        `Add spaceVisibilityGate / visibleSpaceAssetVisibilities / AssetVisibility.Timeline\n` +
        `to the query, or add the enclosing function to VIS_ALLOWLIST with a reason.\n` +
        orphans.join('\n'),
    ).toEqual([]);
  });
});
