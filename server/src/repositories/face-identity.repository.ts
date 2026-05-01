import { Injectable } from '@nestjs/common';
import { Insertable, Kysely, Selectable, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DummyValue, GenerateSql } from 'src/decorators';
import { SourceType } from 'src/enum';
import { DB } from 'src/schema';
import { FaceIdentityFaceSource, FaceIdentityFaceTable } from 'src/schema/tables/face-identity-face.table';
import { FaceIdentityTable } from 'src/schema/tables/face-identity.table';

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

@Injectable()
export class FaceIdentityRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

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
