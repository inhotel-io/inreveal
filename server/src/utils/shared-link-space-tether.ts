// Fork-owned predicates for the #1018 shared-link space tether.
//
// A share link created from inside a shared space records that space on `shared_link.spaceId`. That
// column is what lets the link serve photos its creator does not own — and it is deliberately NOT a
// grant. Nothing is frozen at creation time: every read re-derives the non-owned half from live
// space state, exactly as `album_space_asset` contributions are re-derived everywhere else in the
// fork ("visibility is re-derived from live space membership + the live album↔space link on every
// read", see `album-space-asset.table.ts`).
//
// Two conditions must hold for a non-owned asset to be served:
//
//   1. the link creator is still a member of the space, and
//   2. the asset is still visible in that space through one of its paths (direct add, linked
//      library, linked album, or a cross-owner contribution).
//
// Deleting the space nulls `spaceId` (`ON DELETE SET NULL`), which makes both false and degrades the
// link to the creator's own assets rather than breaking it. Encoding this once here means the access
// gate and the link payload can never drift apart and start disagreeing about what a link shows.
import { Expression, ExpressionBuilder, SqlBool } from 'kysely';
import { DB } from 'src/schema';
import { spaceAssetPathBranches, spaceVisibilityGate } from 'src/utils/shared-space-album-scope';

/** Condition 1 — the link's creator is still a member of the space the link was created from. */
export const sharedLinkCreatorIsMember = (eb: ExpressionBuilder<DB, keyof DB>): Expression<SqlBool> =>
  eb.exists(
    eb
      .selectFrom('shared_space_member')
      .select(eb.lit(1).as('exists'))
      .whereRef('shared_space_member.spaceId', '=', 'shared_link.spaceId')
      .whereRef('shared_space_member.userId', '=', 'shared_link.userId'),
  );

/**
 * Conditions 1 + 2 for the outer `asset` row: the full tether. Correlates on `asset.id` /
 * `asset.libraryId`, so the caller must have `asset` in scope.
 */
export const sharedLinkSpaceTether = (eb: ExpressionBuilder<DB, keyof DB>): Expression<SqlBool> =>
  eb.and([
    eb('shared_link.spaceId', 'is not', null),
    sharedLinkCreatorIsMember(eb),
    spaceVisibilityGate(eb, 'asset.visibility'),
    eb.or(
      spaceAssetPathBranches(eb, {
        correlateAssetId: 'asset.id',
        correlateLibraryId: 'asset.libraryId',
        scope: { spaceIdRef: 'shared_link.spaceId' },
      }),
    ),
  ]);

/**
 * An asset is servable through a link when the creator owns it (always theirs to share) or the
 * tether currently holds. Correlates on the outer `asset` row.
 */
export const sharedLinkAssetIsServable = (eb: ExpressionBuilder<DB, keyof DB>): Expression<SqlBool> =>
  eb.or([eb(eb.ref('asset.ownerId'), '=', eb.ref('shared_link.userId')), sharedLinkSpaceTether(eb)]);

/**
 * Kysely types every table inside a LEFT JOIN's `ON` context as `Nullable<...>`, which makes that
 * builder structurally incompatible with the helpers above even though they only reach base tables
 * through correlated EXISTS subqueries, where the outer nullability cannot matter. One named alias
 * documents the widening instead of scattering casts across the call sites.
 */
export const asBaseEb = (eb: unknown) => eb as ExpressionBuilder<DB, keyof DB>;
