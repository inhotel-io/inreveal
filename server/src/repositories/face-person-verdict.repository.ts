import { Injectable } from '@nestjs/common';
import { Expression, ExpressionBuilder, Kysely, SelectQueryBuilder, sql, SqlBool, Transaction } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DummyValue, GenerateSql } from 'src/decorators';
import { DB } from 'src/schema';
import { FacePersonVerdictSource } from 'src/schema/tables/face-person-verdict.table';
import { reviewableAssetVisibility } from 'src/utils/face-review';
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

// Rows (or ids) per statement for the bulk paths below. Matches the chunk size every other face bulk path in
// the codebase uses; the widest of these writes 7 columns, so a chunk is ~7 000 bind parameters — comfortably
// under Postgres's 65 535 ceiling.
const BULK_CHUNK_SIZE = 1000;

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
  async resolveAssignedFace(assetFaceId: string, db: Kysely<DB> | Transaction<DB> = this.db): Promise<void> {
    await db
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
  async drainPendingForFaces(assetFaceIds: string[], db: Kysely<DB> | Transaction<DB> = this.db): Promise<number> {
    if (assetFaceIds.length === 0) {
      return 0;
    }
    // Chunked like every other bulk face path (reattributeFaces, detachFaces, replaceFaceIdentities): one id is
    // one bind parameter, so an unchunked IN-list breaks at Postgres's 65 535-parameter ceiling. That was
    // unreachable while the resolve DTO capped a bucket at 1000; it is reachable now that the cap is 25 000.
    // Callers pass `db` when they need this inside their own transaction, so chunks stay atomic with the move.
    let deleted = 0;
    for (let index = 0; index < assetFaceIds.length; index += BULK_CHUNK_SIZE) {
      const result = await db
        .deleteFrom('face_person_verdict')
        .where('assetFaceId', 'in', assetFaceIds.slice(index, index + BULK_CHUNK_SIZE))
        .where('status', '=', 'pending')
        .executeTakeFirst();
      deleted += Number(result.numDeletedRows ?? 0n);
    }
    return deleted;
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

  // The single definition of "this pending row is eligible". Used by the read (getPendingForPerson /
  // getPendingForSpacePerson), the pendingness probe (hasPendingForSpacePerson) and — the point of Slice 3 —
  // the CLAIM. A row the queue will not show must not be confirmable through it (F5/F6). Requires the query
  // already joined to `asset_face as af` and `asset`.
  // T is intentionally SelectQueryBuilder<any, any, any>, not <DB, any, any>: the caller's builder is always
  // ALIAS-WIDENED (fpv/af), which does not structurally match a query typed against the literal DB schema —
  // same reason the alias casts elsewhere in this file exist. The column names below are hardcoded string
  // literals against the fpv/af/asset aliases every call site uses, so the loss of column-name checking here
  // is scoped to this one private helper.
  private applyPendingEligibility<T extends SelectQueryBuilder<any, any, any>>(
    qb: T,
    opts: { maxDistance: number; suggestionMaxDistance: number },
  ): T {
    // Cast at the return edge, not the parameter: TypeScript resolves `.where()` on a bare `T` via its
    // constraint, collapsing the result to `SelectQueryBuilder<any, any, any>` — chaining `.where()` never
    // changes a query's DB/TB/O shape, so casting back to the caller's own `T` is sound.
    return (
      qb
        .where('fpv.distance', '>', opts.maxDistance)
        .where('fpv.distance', '<=', opts.suggestionMaxDistance)
        .where('af.personId', 'is', null)
        .where('af.deletedAt', 'is', null)
        .where('af.isVisible', 'is', true)
        .where('asset.deletedAt', 'is', null)
        .where('asset.isOffline', 'is', false)
        .where((eb) => reviewableAssetVisibility(eb as unknown as ExpressionBuilder<DB, keyof DB>))
        // D3 self-heal: a face already placed by a human (any identity — owner-agnostic) never stays pending,
        // even if the write path that settled it didn't drain this row.
        .where((eb) =>
          eb.not(
            eb.exists((eb) =>
              eb
                .selectFrom('face_identity_face as fif')
                .whereRef('fif.assetFaceId', '=', 'fpv.assetFaceId')
                .where('fif.source', '=', 'manual'),
            ),
          ),
        ) as T
    );
  }

  // The negative-verdict anti-join, target-specific (matched by the caller-supplied `matchTarget`) but
  // otherwise identical shape for every scope. `matchTarget` receives the negative-verdict subquery's own
  // expression builder (already correlated to the outer `fpv` row) and returns the OR-list match — a personId
  // / spacePersonId equality plus an identityId equality (literal or column/subquery reference).
  // `matchTarget`'s `eb` is deliberately untyped (`any`): it is the exists-subquery's own expression builder,
  // correlated to `neg` plus every outer alias (fpv/af/asset and whatever the call site joined) — a shape
  // that cannot be named against the literal DB schema. Every call site below hardcodes its own known-good
  // column names against that context, same trade-off as applyPendingEligibility above.
  private excludeNegativeVerdict<T extends SelectQueryBuilder<any, any, any>>(
    qb: T,
    matchTarget: (eb: any) => Expression<SqlBool>,
  ): T {
    return qb.where((eb) =>
      eb.not(
        eb.exists((eb) =>
          eb
            .selectFrom('face_person_verdict as neg')
            .whereRef('neg.assetFaceId', '=', 'fpv.assetFaceId')
            .where('neg.status', 'in', ['rejected', 'ignored'])
            .where((inner: any) => matchTarget(inner)),
        ),
      ),
    ) as T;
  }

  // Confirm has NO status of its own. The durable positive record is the face's manual identity link,
  // written by the caller's reassignment; all this layer has to do is drain the queue for that face. Callers
  // use `claimPending` first so a double-submit still reports "nothing to do" exactly once.
  //
  // Slice 3 (F5): the claim is now gated by the SAME eligibility the read applies — a row the queue would not
  // show (Locked asset, trashed, offline, invisible face, manually linked elsewhere, negatively verdicted)
  // must not be confirmable. This is a single DELETE ... WHERE id IN (SELECT ...) statement so it stays one
  // round-trip and, critically, runs entirely on the passed `db` handle — `confirmFaceSuggestion` calls this
  // inside a transaction and every statement it issues must use that handle (never `this.db`, issue #595).
  // The target's identityId is resolved via a LEFT JOIN to `person` rather than a caller-supplied value or a
  // second round-trip.
  @GenerateSql({ params: [DummyValue.UUID, DummyValue.UUID, { maxDistance: 0.5, suggestionMaxDistance: 0.8 }] })
  async claimPending(
    personId: string,
    assetFaceId: string,
    opts: { maxDistance: number; suggestionMaxDistance: number },
    db: Kysely<DB> | Transaction<DB> = this.db,
  ): Promise<number> {
    const eligibleIds = this.excludeNegativeVerdict(
      this.applyPendingEligibility(
        db
          .selectFrom('face_person_verdict as fpv')
          .innerJoin('asset_face as af', 'af.id', 'fpv.assetFaceId')
          .innerJoin('asset', 'asset.id', 'af.assetId')
          .leftJoin('person', 'person.id', 'fpv.personId')
          .select('fpv.id as id')
          .where('fpv.personId', '=', personId)
          .where('fpv.assetFaceId', '=', assetFaceId)
          .where('fpv.status', '=', 'pending'),
        opts,
      ),
      (inner) =>
        inner.or([inner('neg.personId', '=', personId), inner('neg.identityId', '=', inner.ref('person.identityId'))]),
    );

    const result = await db.deleteFrom('face_person_verdict').where('id', 'in', eligibleIds).executeTakeFirst();
    return Number(result.numDeletedRows ?? 0n);
  }

  // Space twin of claimPending (F5/F6). `db` defaults to `this.db` for constructor symmetry — Slice 5 is the
  // slice that threads a transaction handle through the space confirm path, so callers keep passing nothing
  // for now. The target's identityId is resolved via a LEFT JOIN to `shared_space_person` (already the claim
  // target, so no extra round trip).
  @GenerateSql({
    params: [DummyValue.UUID, DummyValue.UUID, { maxDistance: 0.5, suggestionMaxDistance: 0.8 }],
  })
  async claimPendingForSpacePerson(
    spacePersonId: string,
    assetFaceId: string,
    opts: { maxDistance: number; suggestionMaxDistance: number },
    db: Kysely<DB> | Transaction<DB> = this.db,
  ): Promise<number> {
    const eligibleIds = this.excludeNegativeVerdict(
      this.applyPendingEligibility(
        db
          .selectFrom('face_person_verdict as fpv')
          .innerJoin('asset_face as af', 'af.id', 'fpv.assetFaceId')
          .innerJoin('asset', 'asset.id', 'af.assetId')
          .leftJoin('shared_space_person', 'shared_space_person.id', 'fpv.spacePersonId')
          .select('fpv.id as id')
          .where('fpv.spacePersonId', '=', spacePersonId)
          .where('fpv.assetFaceId', '=', assetFaceId)
          .where('fpv.status', '=', 'pending'),
        opts,
      ),
      (inner) =>
        inner.or([
          inner('neg.spacePersonId', '=', spacePersonId),
          inner('neg.identityId', '=', inner.ref('shared_space_person.identityId')),
        ]),
    );

    const result = await db.deleteFrom('face_person_verdict').where('id', 'in', eligibleIds).executeTakeFirst();
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

  @GenerateSql({ params: [DummyValue.UUID, DummyValue.UUID, { source: 'cleanup' }] })
  async markRejected(
    personId: string,
    assetFaceId: string,
    opts?: { identityId?: string | null; source?: FacePersonVerdictSource; actorId?: string | null },
  ): Promise<number> {
    return this.recordPersonalVerdict({ personId, assetFaceId, status: 'rejected', ...opts });
  }

  // Set-at-a-time form of markRejected, for the cleanup console's "keep here" bucket. That bucket used to loop
  // markRejected once per face — one round-trip each, which the 1000-face DTO cap kept merely slow and the
  // 25 000-face cap would turn into a timeout on the exact large cluster the raise exists to serve.
  //
  // `status`, `source` and `actorId` are uniform per call (one admin, one action), so only `personId`,
  // `assetFaceId` and `identityId` vary per row and the whole bucket collapses into chunked multi-row upserts.
  // Rows are deduplicated on (personId, assetFaceId) FIRST: Postgres refuses an ON CONFLICT DO UPDATE that
  // would touch the same row twice in one statement ("cannot affect row a second time"), and a client may
  // legitimately repeat a face — the per-face loop absorbed that silently, so this must too.
  @GenerateSql({
    params: [
      [{ personId: DummyValue.UUID, assetFaceId: DummyValue.UUID, identityId: DummyValue.UUID }],
      { source: 'cleanup' },
    ],
  })
  async markRejectedMany(
    rows: Array<{ personId: string; assetFaceId: string; identityId?: string | null }>,
    opts?: { source?: FacePersonVerdictSource; actorId?: string | null },
  ): Promise<number> {
    if (rows.length === 0) {
      return 0;
    }
    const deduplicated = [...new Map(rows.map((row) => [`${row.personId}|${row.assetFaceId}`, row])).values()];
    const source = opts?.source ?? 'suggestion';
    const actorId = opts?.actorId ?? null;

    let written = 0;
    for (let index = 0; index < deduplicated.length; index += BULK_CHUNK_SIZE) {
      const result = await this.db
        .insertInto('face_person_verdict')
        .values(
          deduplicated.slice(index, index + BULK_CHUNK_SIZE).map((row) => ({
            personId: row.personId,
            assetFaceId: row.assetFaceId,
            identityId: row.identityId ?? null,
            status: 'rejected' as const,
            source,
            actorId,
            distance: null,
          })),
        )
        .onConflict((oc) =>
          oc
            .columns(['personId', 'assetFaceId'])
            .where('personId', 'is not', null)
            .doUpdateSet({
              status: 'rejected',
              // D10: never null a stronger existing key — same coalesce the single-row path uses.
              identityId: sql`coalesce(excluded."identityId", "face_person_verdict"."identityId")`,
              source,
              actorId,
              updatedAt: sql`now()`,
            }),
        )
        .executeTakeFirst();
      written += Number(result.numInsertedOrUpdatedRows ?? 0n);
    }
    return written;
  }

  @GenerateSql({ params: [DummyValue.UUID, DummyValue.UUID, { source: 'suggestion' }] })
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

  @GenerateSql({ params: [DummyValue.UUID, DummyValue.UUID, { source: 'cleanup' }] })
  async markRejectedForSpacePerson(
    spacePersonId: string,
    assetFaceId: string,
    opts?: { identityId?: string | null; source?: FacePersonVerdictSource; actorId?: string | null },
  ): Promise<number> {
    return this.recordSpacePersonVerdict({ spacePersonId, assetFaceId, status: 'rejected', ...opts });
  }

  @GenerateSql({ params: [DummyValue.UUID, DummyValue.UUID, { source: 'suggestion' }] })
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

    // Read gate: person must be scannable (named, not hidden, type='person'). Also resolves identityId once
    // here for the negative-verdict anti-join below, rather than a correlated subquery per row.
    const scannable = await this.db
      .selectFrom('person')
      .select(['person.id', 'person.identityId'])
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
    // Slice 3: band + af/asset visibility gates + manual-link anti-join now come from the shared eligibility
    // predicate also used by claimPending — this must keep emitting the same SQL, apart from Slice 1's
    // reviewableAssetVisibility swap-in for the equivalent literal AssetVisibility.Archive/Timeline check.
    const base = this.excludeNegativeVerdict(
      this.applyPendingEligibility(
        this.db
          .selectFrom('face_person_verdict as fpv')
          .innerJoin('asset_face as af', 'af.id', 'fpv.assetFaceId')
          .innerJoin('asset', 'asset.id', 'af.assetId')
          .where('fpv.personId', '=', personId)
          .where('fpv.status', '=', 'pending'),
        opts,
      ),
      // D3 self-heal: a face a human has already said "not this person" about — matched identity-first (so
      // a rejection recorded in another scope sharing this person's identity is honoured here too), with a
      // personId fallback for verdicts recorded before an identity existed.
      (inner) =>
        inner.or([
          inner('neg.personId', '=', personId),
          ...(scannable.identityId ? [inner('neg.identityId', '=', scannable.identityId)] : []),
        ]),
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

    // Also resolves identityId once here for the negative-verdict anti-join below, rather than a correlated
    // subquery per row.
    const scannable = await this.db
      .selectFrom('shared_space_person')
      .innerJoin('shared_space', 'shared_space.id', 'shared_space_person.spaceId')
      .select(['shared_space_person.id', 'shared_space_person.identityId'])
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

    // Slice 3: band + af/asset visibility gates + manual-link anti-join now come from the shared eligibility
    // predicate also used by claimPendingForSpacePerson — this must keep emitting the same SQL, apart from
    // Slice 1's reviewableAssetVisibility swap-in for the equivalent literal AssetVisibility.Archive/Timeline
    // check. The space-reachability OR (spaceAssetPathBranches) is space-only and stays separate.
    const base = this.excludeNegativeVerdict(
      this.applyPendingEligibility(
        this.db
          .selectFrom('face_person_verdict as fpv')
          .innerJoin('asset_face as af', 'af.id', 'fpv.assetFaceId')
          .innerJoin('asset', 'asset.id', 'af.assetId')
          .where('fpv.spacePersonId', '=', spacePersonId)
          .where('fpv.status', '=', 'pending')
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
          ),
        opts,
      ),
      // D3 self-heal: a face a human has already said "not this space person" about — matched
      // identity-first (so a rejection recorded in another scope sharing this space person's identity is
      // honoured here too), with a spacePersonId fallback for verdicts recorded before an identity existed.
      (inner) =>
        inner.or([
          inner('neg.spacePersonId', '=', spacePersonId),
          ...(scannable.identityId ? [inner('neg.identityId', '=', scannable.identityId)] : []),
        ]),
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

    // Slice 3 (F6): this reproduced the display-state gates its read twin (getPendingForSpacePerson) applies
    // but OMITTED the manual-link and negative-verdict anti-joins — closed here via the same shared helpers,
    // so a face already claimed elsewhere, or already negatively verdicted, is no longer reported pending.
    const row = await this.excludeNegativeVerdict(
      this.applyPendingEligibility(
        this.db
          .selectFrom('face_person_verdict as fpv')
          .innerJoin('shared_space_person', 'shared_space_person.id', 'fpv.spacePersonId')
          .innerJoin('shared_space', 'shared_space.id', 'shared_space_person.spaceId')
          .innerJoin('asset_face as af', 'af.id', 'fpv.assetFaceId')
          .innerJoin('asset', 'asset.id', 'af.assetId')
          .where('fpv.spacePersonId', '=', spacePersonId)
          .where('fpv.assetFaceId', '=', assetFaceId)
          .where('fpv.status', '=', 'pending')
          .where('shared_space_person.spaceId', '=', spaceId)
          .where(sql`BTRIM("shared_space_person"."name")`, '<>', '')
          .where('shared_space_person.isHidden', 'is', false)
          .where('shared_space_person.type', '=', 'person')
          .where('shared_space.faceRecognitionEnabled', 'is', true)
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
          ),
        opts,
      ),
      (inner) =>
        inner.or([
          inner('neg.spacePersonId', '=', spacePersonId),
          inner('neg.identityId', '=', inner.ref('shared_space_person.identityId')),
        ]),
    )
      .select('fpv.assetFaceId')
      .executeTakeFirst();

    return !!row;
  }

  // D9/F3 (Slice 1): reachability for a face's asset in a space, gated exactly like the display-state gates
  // getPendingForSpacePerson already applies — display state and reachability are not separable here,
  // because a face whose asset the caller can no longer see (trashed, offline, Locked/Hidden) or whose face
  // row itself is not currently shown (tombstoned, invisible) must not be a valid verdict target either.
  // Used to gate space reject/ignore so a drained-but-still-reachable face can still be resolved (no silent
  // no-op), while a face whose asset has genuinely left the space, or is no longer reviewable, is refused.
  @GenerateSql({ params: [DummyValue.UUID, DummyValue.UUID] })
  async isFaceReachableInSpace(spaceId: string, assetFaceId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('asset_face')
      .innerJoin('asset', 'asset.id', 'asset_face.assetId')
      .select('asset_face.id')
      .where('asset_face.id', '=', assetFaceId)
      .where('asset_face.deletedAt', 'is', null)
      .where('asset_face.isVisible', 'is', true)
      .where('asset.deletedAt', 'is', null)
      .where('asset.isOffline', 'is', false)
      .where((eb) => reviewableAssetVisibility(eb))
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
