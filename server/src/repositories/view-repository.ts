import { ExpressionBuilder, Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DummyValue, GenerateSql } from 'src/decorators';
import { AssetVisibility } from 'src/enum';
import { DB } from 'src/schema';
import { asUuid, withExif } from 'src/utils/database';
import { favoriteExistsFor } from 'src/utils/favorite';
import { spaceAssetPathBranches } from 'src/utils/shared-space-album-scope';

export class ViewRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  @GenerateSql({ params: [DummyValue.UUID] })
  async getUniqueOriginalPaths(userId: string) {
    const results = await this.db
      .selectFrom('asset')
      .select((eb) => eb.fn<string>('substring', ['asset.originalPath', eb.val('^(.*/)[^/]*$')]).as('directoryPath'))
      .distinct()
      .where((eb) => this.ownedOrSpaceAccessible(eb, userId))
      .where('visibility', '=', AssetVisibility.Timeline)
      .where('deletedAt', 'is', null)
      .where('fileCreatedAt', 'is not', null)
      .where('fileModifiedAt', 'is not', null)
      .where('localDateTime', 'is not', null)
      .orderBy('directoryPath', 'asc')
      .execute();

    return results.map((row) => row.directoryPath.replaceAll(/\/$/g, ''));
  }

  @GenerateSql({ params: [DummyValue.UUID, DummyValue.STRING] })
  async getAssetsByOriginalPath(userId: string, partialPath: string) {
    const normalizedPath = partialPath.replaceAll(/\/$/g, '');

    return (
      this.db
        .selectFrom('asset')
        .selectAll('asset')
        .$call(withExif)
        // #763: userId doubles as the caller here (this repository has only one user concept — no
        // owner/caller split like the shared-space browse paths), so it's also the right id to
        // project the per-user isFavorite overlay for. Gated on `.$if` (always true — userId is a
        // required param) purely so Kysely infers `isFavoriteForUser` as optional, matching
        // MapAsset and every other projection site instead of forcing it required here alone.
        .$if(!!userId, (qb) => qb.select((eb) => favoriteExistsFor(eb, userId).as('isFavoriteForUser')))
        .where((eb) => this.ownedOrSpaceAccessible(eb, userId))
        .where('visibility', '=', AssetVisibility.Timeline)
        .where('deletedAt', 'is', null)
        .where('fileCreatedAt', 'is not', null)
        .where('fileModifiedAt', 'is not', null)
        .where('localDateTime', 'is not', null)
        .where('originalPath', 'like', `%${normalizedPath}/%`)
        .where('originalPath', 'not like', `%${normalizedPath}/%/%`)
        .orderBy(
          (eb) => eb.fn('regexp_replace', ['asset.originalPath', eb.val('.*/(.+)'), eb.val(String.raw`\1`)]),
          'asc',
        )
        .execute()
    );
  }

  // The folder explorer shows folders for assets a user can actually see: their own,
  // plus any reachable through a shared space they are a member of — either added to
  // the space directly or via a library linked to the space. Mirrors the access rules
  // in AccessRepository.checkSpaceAccess so non-admin space members are not stuck with
  // an empty tree (issue #637).
  private ownedOrSpaceAccessible(eb: ExpressionBuilder<DB, 'asset'>, userId: string) {
    return eb.or([
      eb('asset.ownerId', '=', asUuid(userId)),
      ...spaceAssetPathBranches(eb, {
        correlateAssetId: 'asset.id',
        correlateLibraryId: 'asset.libraryId',
        scope: { memberUserId: userId },
        requireShowInTimeline: true,
      }),
    ]);
  }
}
