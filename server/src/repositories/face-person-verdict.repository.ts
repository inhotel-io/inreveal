import { Injectable } from '@nestjs/common';
import { ExpressionBuilder, Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DummyValue, GenerateSql } from 'src/decorators';
import { AssetVisibility } from 'src/enum';
import { DB } from 'src/schema';
import { FacePersonVerdictSource } from 'src/schema/tables/face-person-verdict.table';
import { spaceAssetPathBranches } from 'src/utils/shared-space-album-scope';

export interface NegativeVerdictListRow {
  id: string;
  assetFaceId: string;
  status: string;
  source: string;
  createdAt: string;
  personId: string | null;
  personName: string | null;
  personThumbnailFaceId: string | null;
  spacePersonId: string | null;
  spacePersonName: string | null;
  spaceName: string | null;
  actorId: string | null;
  actorName: string | null;
}

@Injectable()
export class FacePersonVerdictRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  @GenerateSql({ params: [[{ personId: DummyValue.UUID, assetFaceId: DummyValue.UUID, distance: 0.6 }]] })
  async upsertPending(rows: Array<{ personId: string; assetFaceId: string; distance: number }>): Promise<void> {
    if (rows.length === 0) {
      return;
    }
    await this.db
      .insertInto('face_person_verdict')
      .values(rows.map((r) => ({ personId: r.personId, assetFaceId: r.assetFaceId, distance: r.distance })))
      .onConflict((oc) =>
        oc
          .columns(['personId', 'assetFaceId'])
          .where('personId', 'is not', null)
          .doUpdateSet({
            distance: (eb) => eb.ref('excluded.distance'),
            updatedAt: sql`now()`,
          })
          .where('face_person_verdict.status', '=', 'pending'),
      )
      .execute();
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  async resolveAssignedFace(assetFaceId: string): Promise<void> {
    await this.db
      .deleteFrom('face_person_verdict')
      .where('assetFaceId', '=', assetFaceId)
      .where('status', '=', 'pending')
      .execute();
  }

  // Bulk drain of pending queue rows for a set of faces. The cleanup console calls this after a resolve so a
  // moved/detached/confirmed face leaves no stale suggestion behind — leak 3: without it the never-reappear
  // guarantee was held only by the read path's `af.personId IS NULL` filter, and would break the moment such
  // a face was later unassigned (e.g. a reset). Negative-verdict rows are left intact.
  @GenerateSql({ params: [[DummyValue.UUID]] })
  async drainPendingForFaces(assetFaceIds: string[]): Promise<number> {
    if (assetFaceIds.length === 0) {
      return 0;
    }
    const result = await this.db
      .deleteFrom('face_person_verdict')
      .where('assetFaceId', 'in', assetFaceIds)
      .where('status', '=', 'pending')
      .executeTakeFirst();
    return Number(result.numDeletedRows ?? 0n);
  }

  @GenerateSql({ params: [[{ spacePersonId: DummyValue.UUID, assetFaceId: DummyValue.UUID, distance: 0.6 }]] })
  async upsertPendingForSpacePerson(
    rows: Array<{ spacePersonId: string; assetFaceId: string; distance: number }>,
  ): Promise<void> {
    if (rows.length === 0) {
      return;
    }
    await this.db
      .insertInto('face_person_verdict')
      .values(rows.map((r) => ({ spacePersonId: r.spacePersonId, assetFaceId: r.assetFaceId, distance: r.distance })))
      .onConflict((oc) =>
        oc
          .columns(['spacePersonId', 'assetFaceId'])
          .where('spacePersonId', 'is not', null)
          .doUpdateSet({
            distance: (eb) => eb.ref('excluded.distance'),
            updatedAt: sql`now()`,
          })
          .where('face_person_verdict.status', '=', 'pending'),
      )
      .execute();
  }

  // Confirm has NO status of its own. The durable positive record is the face's manual identity link,
  // written by the caller's reassignment; all this layer has to do is drain the queue for that face. Callers
  // use `claimPending` first so a double-submit still reports "nothing to do" exactly once.
  @GenerateSql({ params: [DummyValue.UUID, DummyValue.UUID] })
  async claimPending(personId: string, assetFaceId: string): Promise<number> {
    const result = await this.db
      .deleteFrom('face_person_verdict')
      .where('personId', '=', personId)
      .where('assetFaceId', '=', assetFaceId)
      .where('status', '=', 'pending')
      .executeTakeFirst();
    return Number(result.numDeletedRows ?? 0n);
  }

  @GenerateSql({ params: [DummyValue.UUID, DummyValue.UUID] })
  async claimPendingForSpacePerson(spacePersonId: string, assetFaceId: string): Promise<number> {
    const result = await this.db
      .deleteFrom('face_person_verdict')
      .where('spacePersonId', '=', spacePersonId)
      .where('assetFaceId', '=', assetFaceId)
      .where('status', '=', 'pending')
      .executeTakeFirst();
    return Number(result.numDeletedRows ?? 0n);
  }

  // Negative verdicts are UPSERTED, not just flipped from a pending row: the cleanup console records
  // "this face is not that person" for faces that never had a suggestion queued, so there is frequently no
  // row to update. `identityId` is resolved by the caller and stored alongside the target so one verdict
  // answers the question in personal scope and in every space.
  private async recordPersonalVerdict(input: {
    personId: string;
    assetFaceId: string;
    status: 'rejected' | 'ignored';
    identityId?: string | null;
    source?: FacePersonVerdictSource;
    actorId?: string | null;
  }): Promise<number> {
    const result = await this.db
      .insertInto('face_person_verdict')
      .values({
        personId: input.personId,
        assetFaceId: input.assetFaceId,
        identityId: input.identityId ?? null,
        status: input.status,
        source: input.source ?? 'suggestion',
        actorId: input.actorId ?? null,
        distance: null,
      })
      .onConflict((oc) =>
        oc
          .columns(['personId', 'assetFaceId'])
          .where('personId', 'is not', null)
          .doUpdateSet({
            status: input.status,
            // D10: never null a stronger existing key — keep the existing identity when the incoming write
            // omits one. `excluded` is the Postgres ON CONFLICT alias for the row proposed for insertion.
            identityId: sql`coalesce(excluded."identityId", "face_person_verdict"."identityId")`,
            source: input.source ?? 'suggestion',
            actorId: input.actorId ?? null,
            updatedAt: sql`now()`,
          }),
      )
      .executeTakeFirst();
    return Number(result.numInsertedOrUpdatedRows ?? 0n);
  }

  @GenerateSql({ params: [{ personId: DummyValue.UUID, assetFaceId: DummyValue.UUID, status: 'rejected' }] })
  async markRejected(
    personId: string,
    assetFaceId: string,
    opts?: { identityId?: string | null; source?: FacePersonVerdictSource; actorId?: string | null },
  ): Promise<number> {
    return this.recordPersonalVerdict({ personId, assetFaceId, status: 'rejected', ...opts });
  }

  @GenerateSql({ params: [{ personId: DummyValue.UUID, assetFaceId: DummyValue.UUID, status: 'ignored' }] })
  async markIgnored(
    personId: string,
    assetFaceId: string,
    opts?: { identityId?: string | null; source?: FacePersonVerdictSource; actorId?: string | null },
  ): Promise<number> {
    return this.recordPersonalVerdict({ personId, assetFaceId, status: 'ignored', ...opts });
  }

  private async recordSpacePersonVerdict(input: {
    spacePersonId: string;
    assetFaceId: string;
    status: 'rejected' | 'ignored';
    identityId?: string | null;
    source?: FacePersonVerdictSource;
    actorId?: string | null;
  }): Promise<number> {
    const result = await this.db
      .insertInto('face_person_verdict')
      .values({
        spacePersonId: input.spacePersonId,
        assetFaceId: input.assetFaceId,
        identityId: input.identityId ?? null,
        status: input.status,
        source: input.source ?? 'suggestion',
        actorId: input.actorId ?? null,
        distance: null,
      })
      .onConflict((oc) =>
        oc
          .columns(['spacePersonId', 'assetFaceId'])
          .where('spacePersonId', 'is not', null)
          .doUpdateSet({
            status: input.status,
            // D10: never null a stronger existing key — keep the existing identity when the incoming write
            // omits one. `excluded` is the Postgres ON CONFLICT alias for the row proposed for insertion.
            identityId: sql`coalesce(excluded."identityId", "face_person_verdict"."identityId")`,
            source: input.source ?? 'suggestion',
            actorId: input.actorId ?? null,
            updatedAt: sql`now()`,
          }),
      )
      .executeTakeFirst();
    return Number(result.numInsertedOrUpdatedRows ?? 0n);
  }

  @GenerateSql({ params: [{ spacePersonId: DummyValue.UUID, assetFaceId: DummyValue.UUID, status: 'rejected' }] })
  async markRejectedForSpacePerson(
    spacePersonId: string,
    assetFaceId: string,
    opts?: { identityId?: string | null; source?: FacePersonVerdictSource; actorId?: string | null },
  ): Promise<number> {
    return this.recordSpacePersonVerdict({ spacePersonId, assetFaceId, status: 'rejected', ...opts });
  }

  @GenerateSql({ params: [{ spacePersonId: DummyValue.UUID, assetFaceId: DummyValue.UUID, status: 'ignored' }] })
  async markIgnoredForSpacePerson(
    spacePersonId: string,
    assetFaceId: string,
    opts?: { identityId?: string | null; source?: FacePersonVerdictSource; actorId?: string | null },
  ): Promise<number> {
    return this.recordSpacePersonVerdict({ spacePersonId, assetFaceId, status: 'ignored', ...opts });
  }

  // The shared negative-verdict read, identity-first with target fallback. Both engines call this: the
  // suggestion scan before proposing a face, the cleanup filter before flagging one. Returns
  // assetFaceId -> Set<targetToken> so the caller can match against whichever token(s) its target carries.
  // Every negative verdict, newest first, for the admin resolutions page. Joined for display against both
  // possible targets plus the actor, and tagged with the engine that recorded it so the page can separate an
  // admin's "keep here" from a user's "that isn't Anna".
  async listNegativeVerdicts(): Promise<NegativeVerdictListRow[]> {
    const rows = await this.db
      .selectFrom('face_person_verdict as fpv')
      .leftJoin('person', 'person.id', 'fpv.personId')
      .leftJoin('shared_space_person as ssp', 'ssp.id', 'fpv.spacePersonId')
      .leftJoin('shared_space', 'shared_space.id', 'ssp.spaceId')
      .leftJoin('user as actor', 'actor.id', 'fpv.actorId')
      .select([
        'fpv.id as id',
        'fpv.assetFaceId as assetFaceId',
        'fpv.status as status',
        'fpv.source as source',
        'fpv.createdAt as createdAt',
        'fpv.personId as personId',
        'person.name as personName',
        'person.faceAssetId as personThumbnailFaceId',
        'fpv.spacePersonId as spacePersonId',
        'ssp.name as spacePersonName',
        'shared_space.name as spaceName',
        'fpv.actorId as actorId',
        'actor.name as actorName',
      ])
      .where('fpv.status', 'in', ['rejected', 'ignored'])
      .orderBy('fpv.createdAt', 'desc')
      .execute();

    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt as unknown as string,
    }));
  }

  @GenerateSql({ params: [[DummyValue.UUID]] })
  async removeVerdicts(ids: string[]): Promise<number> {
    if (ids.length === 0) {
      return 0;
    }
    const rows = await this.db
      .deleteFrom('face_person_verdict')
      .where('id', 'in', ids)
      .where('status', 'in', ['rejected', 'ignored'])
      .returning('id')
      .execute();
    return rows.length;
  }

  @GenerateSql({ params: [[DummyValue.UUID]] })
  async getNegativeVerdictTokens(assetFaceIds: string[]): Promise<Map<string, Set<string>>> {
    const map = new Map<string, Set<string>>();
    if (assetFaceIds.length === 0) {
      return map;
    }
    const rows = await this.db
      .selectFrom('face_person_verdict')
      .select(['assetFaceId', 'personId', 'spacePersonId', 'identityId'])
      .where('assetFaceId', 'in', assetFaceIds)
      .where('status', 'in', ['rejected', 'ignored'])
      .execute();

    for (const row of rows) {
      const tokens = map.get(row.assetFaceId) ?? new Set<string>();
      if (row.identityId) {
        tokens.add(`identity:${row.identityId}`);
      }
      if (row.personId) {
        tokens.add(`person:${row.personId}`);
      }
      if (row.spacePersonId) {
        tokens.add(`space-person:${row.spacePersonId}`);
      }
      map.set(row.assetFaceId, tokens);
    }
    return map;
  }

  @GenerateSql({
    params: [DummyValue.UUID, { maxDistance: 0.5, suggestionMaxDistance: 0.8, page: 1, size: 10 }],
  })
  async getPendingForPerson(
    personId: string,
    opts: { maxDistance: number; suggestionMaxDistance: number; page: number; size: number },
  ) {
    // Read gate: feature disabled when suggestion band is empty
    if (opts.suggestionMaxDistance <= opts.maxDistance) {
      return { total: 0, items: [] };
    }

    // Read gate: person must be scannable (named, not hidden, type='person')
    const scannable = await this.db
      .selectFrom('person')
      .select('person.id')
      .where('person.id', '=', personId)
      .where('person.name', '!=', '')
      .where('person.isHidden', '=', false)
      .where('person.type', '=', 'person')
      .executeTakeFirst();
    if (!scannable) {
      return { total: 0, items: [] };
    }

    // The count and items queries below are two separate round-trips with no wrapping transaction.
    // A concurrent resolveAssignedFace between them can make total > items.length. This is an
    // acceptable trade-off for a background review queue where stale counts cause no harm.
    const base = this.db
      .selectFrom('face_person_verdict as fpv')
      .innerJoin('asset_face as af', 'af.id', 'fpv.assetFaceId')
      .innerJoin('asset', 'asset.id', 'af.assetId')
      .where('fpv.personId', '=', personId)
      .where('fpv.status', '=', 'pending')
      .where('fpv.distance', '>', opts.maxDistance)
      .where('fpv.distance', '<=', opts.suggestionMaxDistance)
      .where('af.personId', 'is', null)
      .where('af.deletedAt', 'is', null);

    const totalRow = await base.select((eb) => eb.fn.countAll<string>().as('total')).executeTakeFirstOrThrow();

    const items = await base
      .select([
        'fpv.assetFaceId as assetFaceId',
        'fpv.distance as distance',
        'af.assetId as assetId',
        'af.imageWidth as imageWidth',
        'af.imageHeight as imageHeight',
        'af.boundingBoxX1 as boundingBoxX1',
        'af.boundingBoxX2 as boundingBoxX2',
        'af.boundingBoxY1 as boundingBoxY1',
        'af.boundingBoxY2 as boundingBoxY2',
        'asset.fileCreatedAt as fileCreatedAt',
      ])
      .orderBy('fpv.distance', 'asc')
      .limit(opts.size)
      .offset((opts.page - 1) * opts.size)
      // `distance` is nullable on the table (cleanup-sourced verdicts carry none), but the band filter
      // above (`> maxDistance AND <= suggestionMaxDistance`) is never true for NULL, so every row that
      // reaches here has one.
      .$narrowType<{ distance: number }>()
      .execute();

    return { total: Number(totalRow.total), items };
  }

  @GenerateSql({
    params: [DummyValue.UUID, DummyValue.UUID, { maxDistance: 0.5, suggestionMaxDistance: 0.8, page: 1, size: 10 }],
  })
  async getPendingForSpacePerson(
    spaceId: string,
    spacePersonId: string,
    opts: { maxDistance: number; suggestionMaxDistance: number; page: number; size: number },
  ) {
    if (opts.suggestionMaxDistance <= opts.maxDistance) {
      return { total: 0, items: [] };
    }

    const scannable = await this.db
      .selectFrom('shared_space_person')
      .innerJoin('shared_space', 'shared_space.id', 'shared_space_person.spaceId')
      .select('shared_space_person.id')
      .where('shared_space_person.id', '=', spacePersonId)
      .where('shared_space_person.spaceId', '=', spaceId)
      .where(sql`BTRIM("shared_space_person"."name")`, '<>', '')
      .where('shared_space_person.isHidden', 'is', false)
      .where('shared_space_person.type', '=', 'person')
      .where('shared_space.faceRecognitionEnabled', 'is', true)
      .executeTakeFirst();
    if (!scannable) {
      return { total: 0, items: [] };
    }

    const base = this.db
      .selectFrom('face_person_verdict as fpv')
      .innerJoin('asset_face as af', 'af.id', 'fpv.assetFaceId')
      .innerJoin('asset', 'asset.id', 'af.assetId')
      .where('fpv.spacePersonId', '=', spacePersonId)
      .where('fpv.status', '=', 'pending')
      .where('fpv.distance', '>', opts.maxDistance)
      .where('fpv.distance', '<=', opts.suggestionMaxDistance)
      .where('af.personId', 'is', null)
      .where('af.deletedAt', 'is', null)
      .where('af.isVisible', 'is', true)
      .where('asset.deletedAt', 'is', null)
      .where('asset.isOffline', 'is', false)
      .where('asset.visibility', 'in', [AssetVisibility.Archive, AssetVisibility.Timeline])
      // All THREE space access paths (direct / linked library / linked album + cross-owner
      // contributions) via the canonical helper, so an album-linked asset is a candidate too.
      .where((eb) =>
        eb.or(
          // The builder is alias-widened (pfs/af), which does not structurally match the helper's
          // ExpressionBuilder<DB, keyof DB>. The helper only touches shared_space_*/album_* plus the
          // correlate columns passed below, all present here, so the cast is sound.
          spaceAssetPathBranches(eb as unknown as ExpressionBuilder<DB, keyof DB>, {
            correlateAssetId: 'asset.id',
            correlateLibraryId: 'asset.libraryId',
            scope: { spaceId },
          }),
        ),
      );

    const totalRow = await base.select((eb) => eb.fn.countAll<string>().as('total')).executeTakeFirstOrThrow();

    const items = await base
      .select([
        'fpv.assetFaceId as assetFaceId',
        'fpv.distance as distance',
        'af.assetId as assetId',
        'af.imageWidth as imageWidth',
        'af.imageHeight as imageHeight',
        'af.boundingBoxX1 as boundingBoxX1',
        'af.boundingBoxX2 as boundingBoxX2',
        'af.boundingBoxY1 as boundingBoxY1',
        'af.boundingBoxY2 as boundingBoxY2',
        'asset.fileCreatedAt as fileCreatedAt',
      ])
      .orderBy('fpv.distance', 'asc')
      .limit(opts.size)
      .offset((opts.page - 1) * opts.size)
      // `distance` is nullable on the table (cleanup-sourced verdicts carry none), but the band filter
      // above (`> maxDistance AND <= suggestionMaxDistance`) is never true for NULL, so every row that
      // reaches here has one.
      .$narrowType<{ distance: number }>()
      .execute();

    return { total: Number(totalRow.total), items };
  }

  @GenerateSql({
    params: [DummyValue.UUID, DummyValue.UUID, DummyValue.UUID, { maxDistance: 0.5, suggestionMaxDistance: 0.8 }],
  })
  async hasPendingForSpacePerson(
    spaceId: string,
    spacePersonId: string,
    assetFaceId: string,
    opts: { maxDistance: number; suggestionMaxDistance: number },
  ): Promise<boolean> {
    if (opts.suggestionMaxDistance <= opts.maxDistance) {
      return false;
    }

    const row = await this.db
      .selectFrom('face_person_verdict as fpv')
      .innerJoin('shared_space_person', 'shared_space_person.id', 'fpv.spacePersonId')
      .innerJoin('shared_space', 'shared_space.id', 'shared_space_person.spaceId')
      .innerJoin('asset_face as af', 'af.id', 'fpv.assetFaceId')
      .innerJoin('asset', 'asset.id', 'af.assetId')
      .select('fpv.assetFaceId')
      .where('fpv.spacePersonId', '=', spacePersonId)
      .where('fpv.assetFaceId', '=', assetFaceId)
      .where('fpv.status', '=', 'pending')
      .where('fpv.distance', '>', opts.maxDistance)
      .where('fpv.distance', '<=', opts.suggestionMaxDistance)
      .where('shared_space_person.spaceId', '=', spaceId)
      .where(sql`BTRIM("shared_space_person"."name")`, '<>', '')
      .where('shared_space_person.isHidden', 'is', false)
      .where('shared_space_person.type', '=', 'person')
      .where('shared_space.faceRecognitionEnabled', 'is', true)
      .where('af.personId', 'is', null)
      .where('af.deletedAt', 'is', null)
      .where('af.isVisible', 'is', true)
      .where('asset.deletedAt', 'is', null)
      .where('asset.isOffline', 'is', false)
      .where('asset.visibility', 'in', [AssetVisibility.Archive, AssetVisibility.Timeline])
      // All THREE space access paths (direct / linked library / linked album + cross-owner
      // contributions) via the canonical helper, so an album-linked asset is a candidate too.
      .where((eb) =>
        eb.or(
          // The builder is alias-widened (pfs/af), which does not structurally match the helper's
          // ExpressionBuilder<DB, keyof DB>. The helper only touches shared_space_*/album_* plus the
          // correlate columns passed below, all present here, so the cast is sound.
          spaceAssetPathBranches(eb as unknown as ExpressionBuilder<DB, keyof DB>, {
            correlateAssetId: 'asset.id',
            correlateLibraryId: 'asset.libraryId',
            scope: { spaceId },
          }),
        ),
      )
      .executeTakeFirst();

    return !!row;
  }

  // D9: pure RBAC reachability for a face's asset in a space — is this face's asset in the space at all —
  // decoupled from the display-state/pending gates that hasPendingForSpacePerson bundles in. Used to gate
  // space reject/ignore so a drained-but-still-reachable face can still be resolved (no silent no-op), while
  // a face whose asset has genuinely left the space is still refused.
  @GenerateSql({ params: [DummyValue.UUID, DummyValue.UUID] })
  async isFaceReachableInSpace(spaceId: string, assetFaceId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('asset_face')
      .innerJoin('asset', 'asset.id', 'asset_face.assetId')
      .select('asset_face.id')
      .where('asset_face.id', '=', assetFaceId)
      .where((eb) =>
        eb.or(
          spaceAssetPathBranches(eb as unknown as ExpressionBuilder<DB, keyof DB>, {
            correlateAssetId: 'asset.id',
            correlateLibraryId: 'asset.libraryId',
            scope: { spaceId },
          }),
        ),
      )
      .executeTakeFirst();
    return row !== undefined;
  }
}
