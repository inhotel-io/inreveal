import { Injectable } from '@nestjs/common';
import { Insertable, Kysely, Selectable, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DummyValue, GenerateSql } from 'src/decorators';
import { PeopleResponseDto, PersonResponseDto } from 'src/dtos/person.dto';
import { AssetVisibility, SourceType } from 'src/enum';
import { DB } from 'src/schema';
import { FaceIdentityFaceSource, FaceIdentityFaceTable } from 'src/schema/tables/face-identity-face.table';
import { FaceIdentityTable } from 'src/schema/tables/face-identity.table';
import { asBirthDateString, asDateString } from 'src/utils/date';

export type FaceIdentity = Selectable<FaceIdentityTable>;
export type FaceIdentityFace = Selectable<FaceIdentityFaceTable>;

export type LinkFaceInput = {
  assetFaceId: string;
  identityId: string;
  source: FaceIdentityFaceSource;
  confidence?: number | null;
};

export type BackfillResult = {
  processed: number;
  nextCursor?: string;
};

export type SpacePersonBackfillResult = BackfillResult & {
  conflictCount: number;
};

export type MergeIdentitiesResult = {
  personalProfileConflictCount: number;
  spaceProfileConflictCount: number;
};

type AccessiblePeopleOptions = {
  withHidden: boolean;
  page: number;
  size: number;
};

type AccessiblePeopleIdentityPageRow = {
  identityId: string;
  visibleAssetCount: string | number;
};

type AccessiblePeopleCountRow = {
  total: string | number | null;
  hidden: string | number | null;
};

type HydratedAccessiblePersonRow = {
  profileType: 'user-person' | 'space-person';
  profileId: string;
  spaceId: string | null;
  name: string | null;
  birthDate: string | Date | null;
  thumbnailPath: string | null;
  isHidden: boolean;
  isFavorite: boolean | null;
  color: string | null;
  updatedAt: string | Date | null;
  type: string | null;
  species: string | null;
  numberOfAssets: string | number | null;
};

@Injectable()
export class FaceIdentityRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  async getAccessiblePeople(userId: string, options: AccessiblePeopleOptions): Promise<PeopleResponseDto> {
    const page = Math.max(1, options.page);
    const size = Math.max(1, options.size);
    const rows = await this.getAccessiblePeopleIdentityPage({
      userId,
      withHidden: options.withHidden,
      limit: size + 1,
      offset: (page - 1) * size,
    });
    const pageRows = rows.slice(0, size);
    const people = await this.hydrateAccessiblePeople({
      userId,
      identityIds: pageRows.map((row) => row.identityId),
      withHidden: options.withHidden,
    });
    const counts = await this.getAccessiblePeopleCounts(userId);

    return {
      total: Number(counts.total ?? 0),
      hidden: Number(counts.hidden ?? 0),
      hasNextPage: rows.length > size,
      people,
    };
  }

  @GenerateSql({ params: [{ userId: DummyValue.UUID, withHidden: true, limit: 51, offset: 0 }] })
  async getAccessiblePeopleIdentityPage(input: {
    userId: string;
    withHidden: boolean;
    limit: number;
    offset: number;
  }): Promise<AccessiblePeopleIdentityPageRow[]> {
    const result = await sql<AccessiblePeopleIdentityPageRow>`
      WITH timeline_spaces AS (
        SELECT "spaceId"
        FROM shared_space_member
        WHERE "userId" = ${input.userId}
          AND "showInTimeline" = true
      ),
      accessible_faces AS (
        SELECT
          face_identity_face."identityId",
          asset_face."assetId"
        FROM face_identity_face
        INNER JOIN asset_face ON asset_face.id = face_identity_face."assetFaceId"
        INNER JOIN asset ON asset.id = asset_face."assetId"
        WHERE asset_face."deletedAt" IS NULL
          AND asset_face."isVisible" = true
          AND asset."deletedAt" IS NULL
          AND asset.visibility = ${AssetVisibility.Timeline}
          AND (
            asset."ownerId" = ${input.userId}
            OR EXISTS (
              SELECT 1
              FROM shared_space_asset
              INNER JOIN timeline_spaces ON timeline_spaces."spaceId" = shared_space_asset."spaceId"
              WHERE shared_space_asset."assetId" = asset.id
            )
            OR EXISTS (
              SELECT 1
              FROM shared_space_library
              INNER JOIN timeline_spaces ON timeline_spaces."spaceId" = shared_space_library."spaceId"
              WHERE shared_space_library."libraryId" = asset."libraryId"
            )
          )
      ),
      accessible_profiles AS (
        SELECT
          person."identityId",
          person.name,
          person."isHidden",
          person."updatedAt",
          person.id AS "profileId",
          0 AS "profileRank"
        FROM person
        WHERE person."ownerId" = ${input.userId}
          AND person."identityId" IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM accessible_faces WHERE accessible_faces."identityId" = person."identityId"
          )
        UNION ALL
        SELECT
          shared_space_person."identityId",
          COALESCE(NULLIF(shared_space_person_alias.alias, ''), shared_space_person.name, '') AS name,
          shared_space_person."isHidden",
          shared_space_person."updatedAt",
          shared_space_person.id AS "profileId",
          CASE WHEN NULLIF(shared_space_person_alias.alias, '') IS NULL THEN 2 ELSE 1 END AS "profileRank"
        FROM shared_space_person
        INNER JOIN timeline_spaces ON timeline_spaces."spaceId" = shared_space_person."spaceId"
        LEFT JOIN shared_space_person_alias
          ON shared_space_person_alias."personId" = shared_space_person.id
          AND shared_space_person_alias."userId" = ${input.userId}
        WHERE shared_space_person."identityId" IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM accessible_faces WHERE accessible_faces."identityId" = shared_space_person."identityId"
          )
      ),
      eligible_profiles AS (
        SELECT *
        FROM accessible_profiles
        WHERE ${input.withHidden}::boolean OR "isHidden" = false
      ),
      identity_counts AS (
        SELECT
          accessible_faces."identityId",
          COUNT(DISTINCT accessible_faces."assetId") AS "visibleAssetCount"
        FROM accessible_faces
        WHERE EXISTS (
          SELECT 1 FROM eligible_profiles WHERE eligible_profiles."identityId" = accessible_faces."identityId"
        )
        GROUP BY accessible_faces."identityId"
      ),
      best_profiles AS (
        SELECT DISTINCT ON ("identityId")
          "identityId",
          name
        FROM eligible_profiles
        ORDER BY
          "identityId",
          "profileRank",
          NULLIF(name, '') IS NULL,
          lower(name),
          "updatedAt" DESC,
          "profileId"
      )
      SELECT
        identity_counts."identityId",
        identity_counts."visibleAssetCount"
      FROM identity_counts
      INNER JOIN best_profiles ON best_profiles."identityId" = identity_counts."identityId"
      ORDER BY
        NULLIF(best_profiles.name, '') IS NULL,
        lower(best_profiles.name),
        identity_counts."visibleAssetCount" DESC,
        identity_counts."identityId"
      LIMIT ${input.limit}
      OFFSET ${input.offset}
    `.execute(this.db);

    return result.rows;
  }

  async getAccessiblePeopleCounts(userId: string): Promise<{ total: number; hidden: number }> {
    const result = await sql<AccessiblePeopleCountRow>`
      WITH timeline_spaces AS (
        SELECT "spaceId"
        FROM shared_space_member
        WHERE "userId" = ${userId}
          AND "showInTimeline" = true
      ),
      accessible_faces AS (
        SELECT DISTINCT face_identity_face."identityId"
        FROM face_identity_face
        INNER JOIN asset_face ON asset_face.id = face_identity_face."assetFaceId"
        INNER JOIN asset ON asset.id = asset_face."assetId"
        WHERE asset_face."deletedAt" IS NULL
          AND asset_face."isVisible" = true
          AND asset."deletedAt" IS NULL
          AND asset.visibility = ${AssetVisibility.Timeline}
          AND (
            asset."ownerId" = ${userId}
            OR EXISTS (
              SELECT 1
              FROM shared_space_asset
              INNER JOIN timeline_spaces ON timeline_spaces."spaceId" = shared_space_asset."spaceId"
              WHERE shared_space_asset."assetId" = asset.id
            )
            OR EXISTS (
              SELECT 1
              FROM shared_space_library
              INNER JOIN timeline_spaces ON timeline_spaces."spaceId" = shared_space_library."spaceId"
              WHERE shared_space_library."libraryId" = asset."libraryId"
            )
          )
      ),
      accessible_profiles AS (
        SELECT person."identityId", person."isHidden"
        FROM person
        WHERE person."ownerId" = ${userId}
          AND person."identityId" IS NOT NULL
          AND EXISTS (SELECT 1 FROM accessible_faces WHERE accessible_faces."identityId" = person."identityId")
        UNION ALL
        SELECT shared_space_person."identityId", shared_space_person."isHidden"
        FROM shared_space_person
        INNER JOIN timeline_spaces ON timeline_spaces."spaceId" = shared_space_person."spaceId"
        WHERE shared_space_person."identityId" IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM accessible_faces WHERE accessible_faces."identityId" = shared_space_person."identityId"
          )
      ),
      identity_visibility AS (
        SELECT
          "identityId",
          bool_or("isHidden" = false) AS "hasVisibleProfile"
        FROM accessible_profiles
        GROUP BY "identityId"
      )
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE "hasVisibleProfile" = false) AS hidden
      FROM identity_visibility
    `.execute(this.db);

    const row = result.rows[0];
    return { total: Number(row?.total ?? 0), hidden: Number(row?.hidden ?? 0) };
  }

  @GenerateSql({
    params: [{ userId: DummyValue.UUID, identityIds: [DummyValue.UUID], withHidden: true }],
  })
  async hydrateAccessiblePeople(input: {
    userId: string;
    identityIds: string[];
    withHidden: boolean;
  }): Promise<PersonResponseDto[]> {
    if (input.identityIds.length === 0) {
      return [];
    }

    const identityIds = sql`array[${sql.join(input.identityIds)}]::uuid[]`;
    const result = await sql<HydratedAccessiblePersonRow>`
      WITH requested_identities AS (
        SELECT *
        FROM unnest(${identityIds}) WITH ORDINALITY AS requested("identityId", ord)
      ),
      timeline_spaces AS (
        SELECT "spaceId"
        FROM shared_space_member
        WHERE "userId" = ${input.userId}
          AND "showInTimeline" = true
      ),
      accessible_faces AS (
        SELECT
          face_identity_face."identityId",
          asset_face."assetId"
        FROM face_identity_face
        INNER JOIN requested_identities ON requested_identities."identityId" = face_identity_face."identityId"
        INNER JOIN asset_face ON asset_face.id = face_identity_face."assetFaceId"
        INNER JOIN asset ON asset.id = asset_face."assetId"
        WHERE asset_face."deletedAt" IS NULL
          AND asset_face."isVisible" = true
          AND asset."deletedAt" IS NULL
          AND asset.visibility = ${AssetVisibility.Timeline}
          AND (
            asset."ownerId" = ${input.userId}
            OR EXISTS (
              SELECT 1
              FROM shared_space_asset
              INNER JOIN timeline_spaces ON timeline_spaces."spaceId" = shared_space_asset."spaceId"
              WHERE shared_space_asset."assetId" = asset.id
            )
            OR EXISTS (
              SELECT 1
              FROM shared_space_library
              INNER JOIN timeline_spaces ON timeline_spaces."spaceId" = shared_space_library."spaceId"
              WHERE shared_space_library."libraryId" = asset."libraryId"
            )
          )
      ),
      asset_counts AS (
        SELECT
          "identityId",
          COUNT(DISTINCT "assetId") AS "numberOfAssets"
        FROM accessible_faces
        GROUP BY "identityId"
      ),
      profiles AS (
        SELECT
          'user-person'::text AS "profileType",
          person.id AS "profileId",
          NULL::uuid AS "spaceId",
          person."identityId",
          person.name,
          person."birthDate",
          person."thumbnailPath",
          person."isHidden",
          person."isFavorite",
          person.color,
          person."updatedAt",
          person.type,
          person.species,
          0 AS "profileRank"
        FROM person
        INNER JOIN requested_identities ON requested_identities."identityId" = person."identityId"
        WHERE person."ownerId" = ${input.userId}
          AND (${input.withHidden}::boolean OR person."isHidden" = false)
        UNION ALL
        SELECT
          'space-person'::text AS "profileType",
          shared_space_person.id AS "profileId",
          shared_space_person."spaceId",
          shared_space_person."identityId",
          COALESCE(NULLIF(shared_space_person_alias.alias, ''), shared_space_person.name, '') AS name,
          shared_space_person."birthDate",
          ''::text AS "thumbnailPath",
          shared_space_person."isHidden",
          NULL::boolean AS "isFavorite",
          NULL::text AS color,
          shared_space_person."updatedAt",
          shared_space_person.type,
          NULL::text AS species,
          CASE WHEN NULLIF(shared_space_person_alias.alias, '') IS NULL THEN 2 ELSE 1 END AS "profileRank"
        FROM shared_space_person
        INNER JOIN requested_identities ON requested_identities."identityId" = shared_space_person."identityId"
        INNER JOIN timeline_spaces ON timeline_spaces."spaceId" = shared_space_person."spaceId"
        LEFT JOIN shared_space_person_alias
          ON shared_space_person_alias."personId" = shared_space_person.id
          AND shared_space_person_alias."userId" = ${input.userId}
        WHERE ${input.withHidden}::boolean OR shared_space_person."isHidden" = false
      ),
      ranked_profiles AS (
        SELECT
          profiles.*,
          row_number() OVER (
            PARTITION BY profiles."identityId"
            ORDER BY
              profiles."profileRank",
              NULLIF(profiles.name, '') IS NULL,
              lower(profiles.name),
              profiles."updatedAt" DESC,
              profiles."profileId"
          ) AS rn
        FROM profiles
        WHERE EXISTS (SELECT 1 FROM accessible_faces WHERE accessible_faces."identityId" = profiles."identityId")
      )
      SELECT
        ranked_profiles."profileType",
        ranked_profiles."profileId",
        ranked_profiles."spaceId",
        ranked_profiles.name,
        ranked_profiles."birthDate",
        ranked_profiles."thumbnailPath",
        ranked_profiles."isHidden",
        ranked_profiles."isFavorite",
        ranked_profiles.color,
        ranked_profiles."updatedAt",
        ranked_profiles.type,
        ranked_profiles.species,
        asset_counts."numberOfAssets"
      FROM requested_identities
      INNER JOIN ranked_profiles
        ON ranked_profiles."identityId" = requested_identities."identityId"
        AND ranked_profiles.rn = 1
      LEFT JOIN asset_counts ON asset_counts."identityId" = requested_identities."identityId"
      ORDER BY requested_identities.ord
    `.execute(this.db);

    return result.rows.map((row) => this.mapAccessiblePerson(row));
  }

  private mapAccessiblePerson(row: HydratedAccessiblePersonRow): PersonResponseDto {
    const primaryProfile =
      row.profileType === 'space-person'
        ? { type: row.profileType, id: row.profileId, spaceId: row.spaceId ?? undefined }
        : { type: row.profileType, id: row.profileId };

    return {
      id: row.profileId,
      name: row.name ?? '',
      birthDate: asBirthDateString(row.birthDate),
      thumbnailPath: row.profileType === 'user-person' ? (row.thumbnailPath ?? '') : '',
      isHidden: row.isHidden,
      isFavorite: row.isFavorite ?? undefined,
      color: row.color ?? undefined,
      updatedAt: asDateString(row.updatedAt) ?? undefined,
      primaryProfile,
      filterId: `${row.profileType === 'space-person' ? 'space-person' : 'person'}:${row.profileId}`,
      numberOfAssets: Number(row.numberOfAssets ?? 0),
      type: row.type ?? 'person',
      species: row.species,
    };
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  async ensurePersonIdentity(personId: string): Promise<FaceIdentity> {
    return this.db.transaction().execute(async (trx) => {
      const person = await trx
        .selectFrom('person')
        .select(['id', 'identityId', 'type', 'faceAssetId'])
        .where('id', '=', personId)
        .executeTakeFirstOrThrow();

      if (person.identityId) {
        return trx
          .selectFrom('face_identity')
          .selectAll()
          .where('id', '=', person.identityId)
          .executeTakeFirstOrThrow();
      }

      const identity = await trx
        .insertInto('face_identity')
        .values({
          type: person.type,
          representativeFaceId: person.faceAssetId,
        } satisfies Insertable<FaceIdentityTable>)
        .returningAll()
        .executeTakeFirstOrThrow();

      await trx.updateTable('person').set({ identityId: identity.id }).where('id', '=', person.id).execute();

      return identity;
    });
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  async ensureSpacePersonIdentity(spacePersonId: string): Promise<FaceIdentity> {
    return this.db.transaction().execute(async (trx) => {
      const person = await trx
        .selectFrom('shared_space_person')
        .select(['id', 'identityId', 'type', 'representativeFaceId'])
        .where('id', '=', spacePersonId)
        .executeTakeFirstOrThrow();

      if (person.identityId) {
        return trx
          .selectFrom('face_identity')
          .selectAll()
          .where('id', '=', person.identityId)
          .executeTakeFirstOrThrow();
      }

      const identity = await trx
        .insertInto('face_identity')
        .values({
          type: person.type,
          representativeFaceId: person.representativeFaceId,
        } satisfies Insertable<FaceIdentityTable>)
        .returningAll()
        .executeTakeFirstOrThrow();

      await trx
        .updateTable('shared_space_person')
        .set({ identityId: identity.id })
        .where('id', '=', person.id)
        .execute();

      return identity;
    });
  }

  @GenerateSql({
    params: [{ assetFaceId: DummyValue.UUID, identityId: DummyValue.UUID, source: 'owner-person' }],
  })
  async linkFace(input: LinkFaceInput): Promise<FaceIdentityFace> {
    return this.replaceFaceIdentity(input);
  }

  @GenerateSql({
    params: [{ assetFaceId: DummyValue.UUID, identityId: DummyValue.UUID, source: 'manual' }],
  })
  async replaceFaceIdentity(input: LinkFaceInput): Promise<FaceIdentityFace> {
    return this.db
      .insertInto('face_identity_face')
      .values({
        assetFaceId: input.assetFaceId,
        identityId: input.identityId,
        source: input.source,
        confidence: input.confidence ?? null,
      })
      .onConflict((oc) =>
        oc.column('assetFaceId').doUpdateSet({
          identityId: input.identityId,
          source: input.source,
          confidence: input.confidence ?? null,
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  @GenerateSql({ params: [[DummyValue.UUID]] })
  async unlinkFaces(assetFaceIds: string[]): Promise<void> {
    if (assetFaceIds.length === 0) {
      return;
    }
    await this.db.deleteFrom('face_identity_face').where('assetFaceId', 'in', assetFaceIds).execute();
  }

  @GenerateSql({ params: [SourceType.MachineLearning] })
  async unlinkFacesBySourceType(sourceType: SourceType): Promise<void> {
    await this.db
      .deleteFrom('face_identity_face')
      .where('assetFaceId', 'in', this.db.selectFrom('asset_face').select('id').where('sourceType', '=', sourceType))
      .execute();
  }

  async backfillPersonalIdentities(input: { cursor?: string; limit: number }): Promise<BackfillResult> {
    const people = await this.db
      .selectFrom('person')
      .select(['id'])
      .$if(!!input.cursor, (qb) => qb.where('id', '>', input.cursor!))
      .orderBy('id')
      .limit(input.limit + 1)
      .execute();

    const page = people.slice(0, input.limit);
    for (const person of page) {
      const identity = await this.ensurePersonIdentity(person.id);
      const faces = await this.db
        .selectFrom('asset_face')
        .innerJoin('asset', 'asset.id', 'asset_face.assetId')
        .select('asset_face.id')
        .where('asset_face.personId', '=', person.id)
        .where('asset_face.deletedAt', 'is', null)
        .where('asset_face.isVisible', '=', true)
        .where('asset.deletedAt', 'is', null)
        .execute();

      for (const face of faces) {
        await this.linkFace({ assetFaceId: face.id, identityId: identity.id, source: 'backfill' });
      }
    }

    return {
      processed: page.length,
      nextCursor: people.length > input.limit ? page.at(-1)?.id : undefined,
    };
  }

  async backfillSpacePersonIdentities(input: { cursor?: string; limit: number }): Promise<SpacePersonBackfillResult> {
    const people = await this.db
      .selectFrom('shared_space_person')
      .select(['id', 'spaceId', 'identityId'])
      .$if(!!input.cursor, (qb) => qb.where('id', '>', input.cursor!))
      .orderBy('id')
      .limit(input.limit + 1)
      .execute();

    let conflictCount = 0;
    const page = people.slice(0, input.limit);
    for (const person of page) {
      if (person.identityId) {
        continue;
      }

      const linkedIdentities = await this.db
        .selectFrom('shared_space_person_face')
        .innerJoin('asset_face', 'asset_face.id', 'shared_space_person_face.assetFaceId')
        .innerJoin('face_identity_face', 'face_identity_face.assetFaceId', 'asset_face.id')
        .select('face_identity_face.identityId')
        .distinct()
        .where('shared_space_person_face.personId', '=', person.id)
        .where('asset_face.deletedAt', 'is', null)
        .where('asset_face.isVisible', '=', true)
        .execute();

      if (linkedIdentities.length === 1) {
        const existingPerson = await this.db
          .selectFrom('shared_space_person')
          .select('id')
          .where('spaceId', '=', person.spaceId)
          .where('identityId', '=', linkedIdentities[0].identityId)
          .where('id', '!=', person.id)
          .executeTakeFirst();

        if (existingPerson) {
          conflictCount++;
          continue;
        }

        await this.db
          .updateTable('shared_space_person')
          .set({ identityId: linkedIdentities[0].identityId })
          .where('id', '=', person.id)
          .execute();
      } else if (linkedIdentities.length > 1) {
        conflictCount++;
      }
    }

    return {
      processed: page.length,
      nextCursor: people.length > input.limit ? page.at(-1)?.id : undefined,
      conflictCount,
    };
  }

  async mergeIdentities(input: {
    targetIdentityId: string;
    sourceIdentityIds: string[];
    source: FaceIdentityFaceSource;
  }): Promise<MergeIdentitiesResult> {
    const sourceIdentityIds = [...new Set(input.sourceIdentityIds)].filter((id) => id !== input.targetIdentityId);
    if (sourceIdentityIds.length === 0) {
      return { personalProfileConflictCount: 0, spaceProfileConflictCount: 0 };
    }

    return this.db.transaction().execute(async (trx) => {
      const identities = await trx
        .selectFrom('face_identity')
        .select(['id', 'type'])
        .where('id', 'in', [input.targetIdentityId, ...sourceIdentityIds])
        .execute();
      const targetIdentity = identities.find((identity) => identity.id === input.targetIdentityId);
      if (!targetIdentity) {
        throw new Error('Target face identity not found');
      }
      const incompatible = identities.some(
        (identity) => identity.id !== input.targetIdentityId && identity.type !== targetIdentity.type,
      );
      if (incompatible) {
        throw new Error('Cannot merge face identities with different types');
      }

      const personalConflicts = await trx
        .selectFrom('person as source_person')
        .innerJoin('person as target_person', (join) =>
          join
            .onRef('target_person.ownerId', '=', 'source_person.ownerId')
            .on('target_person.identityId', '=', input.targetIdentityId),
        )
        .select('source_person.id')
        .where('source_person.identityId', 'in', sourceIdentityIds)
        .execute();

      const spaceConflicts = await trx
        .selectFrom('shared_space_person as source_person')
        .innerJoin('shared_space_person as target_person', (join) =>
          join
            .onRef('target_person.spaceId', '=', 'source_person.spaceId')
            .on('target_person.identityId', '=', input.targetIdentityId),
        )
        .select('source_person.id')
        .where('source_person.identityId', 'in', sourceIdentityIds)
        .execute();

      await trx
        .updateTable('face_identity_face')
        .set({ identityId: input.targetIdentityId, source: input.source })
        .where('identityId', 'in', sourceIdentityIds)
        .execute();

      await trx
        .updateTable('person')
        .set({ identityId: input.targetIdentityId })
        .where('identityId', 'in', sourceIdentityIds)
        .where(({ not, exists, selectFrom, ref }) =>
          not(
            exists(
              selectFrom('person as target_person')
                .select(sql`1`.as('one'))
                .where('target_person.identityId', '=', input.targetIdentityId)
                .whereRef('target_person.ownerId', '=', ref('person.ownerId')),
            ),
          ),
        )
        .execute();

      await trx
        .updateTable('shared_space_person')
        .set({ identityId: input.targetIdentityId })
        .where('identityId', 'in', sourceIdentityIds)
        .where(({ not, exists, selectFrom, ref }) =>
          not(
            exists(
              selectFrom('shared_space_person as target_person')
                .select(sql`1`.as('one'))
                .where('target_person.identityId', '=', input.targetIdentityId)
                .whereRef('target_person.spaceId', '=', ref('shared_space_person.spaceId')),
            ),
          ),
        )
        .execute();

      const deletable = await trx
        .selectFrom('face_identity')
        .leftJoin('person', 'person.identityId', 'face_identity.id')
        .leftJoin('shared_space_person', 'shared_space_person.identityId', 'face_identity.id')
        .leftJoin('face_identity_face', 'face_identity_face.identityId', 'face_identity.id')
        .select('face_identity.id')
        .where('face_identity.id', 'in', sourceIdentityIds)
        .where('person.id', 'is', null)
        .where('shared_space_person.id', 'is', null)
        .where('face_identity_face.assetFaceId', 'is', null)
        .execute();

      const deletableIds = deletable.map((identity) => identity.id);
      if (deletableIds.length > 0) {
        await trx.deleteFrom('face_identity').where('id', 'in', deletableIds).execute();
      }

      return {
        personalProfileConflictCount: personalConflicts.length,
        spaceProfileConflictCount: spaceConflicts.length,
      };
    });
  }
}
