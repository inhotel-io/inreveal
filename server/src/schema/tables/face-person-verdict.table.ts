import {
  Check,
  Column,
  CreateDateColumn,
  ForeignKeyColumn,
  Generated,
  Index,
  Table,
  Timestamp,
  UpdateDateColumn,
} from '@immich/sql-tools';
import { PrimaryGeneratedUuidV7Column, UpdatedAtTrigger, UpdateIdColumn } from 'src/decorators';
import { AssetFaceTable } from 'src/schema/tables/asset-face.table';
import { FaceIdentityTable } from 'src/schema/tables/face-identity.table';
import { PersonTable } from 'src/schema/tables/person.table';
import { SharedSpacePersonTable } from 'src/schema/tables/shared-space-person.table';
import { UserTable } from 'src/schema/tables/user.table';

// The shared face-review layer. One row says everything the system knows about a (face -> human) pairing:
//
//   status='pending'                  the QUEUE   — a suggestion awaiting review
//   status IN ('rejected','ignored')  the VERDICT — a durable human "this face is not that human"
//
// Both meanings share one uniqueness constraint over (target, face), which is what makes the
// never-reappear guarantee free at the DB layer: the conditional upsert in
// FacePersonVerdictRepository.upsertPending can never resurrect a resolved row.
//
// There is deliberately NO 'confirmed' status. The positive verdict — "a human placed this face on this
// human" — lives in `face_identity_face.source='manual'`, which every human reassignment already writes,
// is keyed by identity (so it survives merges), and is replaced by the next human reassignment (so it
// cannot go stale). Storing it here as well would recreate the duplicate-fact problem this table exists
// to remove.
export type FacePersonVerdictStatus = 'pending' | 'rejected' | 'ignored';
export type FacePersonVerdictSource = 'suggestion' | 'cleanup';

@Table('face_person_verdict')
@UpdatedAtTrigger('face_person_verdict_updatedAt')
@Check({
  name: 'face_person_verdict_status_chk',
  expression: `"status" IN ('pending', 'rejected', 'ignored')`,
})
@Check({
  name: 'face_person_verdict_source_chk',
  expression: `"source" IN ('suggestion', 'cleanup')`,
})
// Never both targets; MAY be neither. A lower bound (`>= 1`) would be wrong: `personId`/`spacePersonId` are
// ON DELETE SET NULL so an identity-keyed verdict outlives the person row it was written against, and a
// `>= 1` check would make that person's DELETE fail outright for any row with no identity. Rows that end up
// fully orphaned (no target, no identity) are unreachable by every read predicate and are collected when
// their face goes, via the assetFaceId CASCADE.
@Check({
  name: 'face_person_verdict_single_target_chk',
  expression: `num_nonnulls("personId", "spacePersonId") <= 1`,
})
@Index({
  name: 'face_person_verdict_personId_status_distance_idx',
  columns: ['personId', 'status', 'distance'],
})
@Index({
  name: 'face_person_verdict_spacePersonId_status_distance_idx',
  columns: ['spacePersonId', 'status', 'distance'],
  where: '"spacePersonId" IS NOT NULL',
})
// The cross-scope read: one "not Anna" answers the question for Anna's personal person AND her profile in
// every space, because both FK the same face_identity row.
@Index({
  name: 'face_person_verdict_identityId_assetFaceId_idx',
  columns: ['identityId', 'assetFaceId'],
  where: '"identityId" IS NOT NULL',
})
@Index({ name: 'face_person_verdict_assetFaceId_idx', columns: ['assetFaceId'] })
@Index({
  name: 'face_person_verdict_personId_assetFaceId_uq',
  columns: ['personId', 'assetFaceId'],
  unique: true,
  where: '"personId" IS NOT NULL',
})
@Index({
  name: 'face_person_verdict_spacePersonId_assetFaceId_uq',
  columns: ['spacePersonId', 'assetFaceId'],
  unique: true,
  where: '"spacePersonId" IS NOT NULL',
})
export class FacePersonVerdictTable {
  @PrimaryGeneratedUuidV7Column()
  id!: Generated<string>;

  @ForeignKeyColumn(() => PersonTable, { onDelete: 'SET NULL', index: false, nullable: true })
  personId!: string | null;

  @ForeignKeyColumn(() => SharedSpacePersonTable, { onDelete: 'SET NULL', index: false, nullable: true })
  spacePersonId!: string | null;

  // Identity-first key. Written whenever the target has an identity; the target columns above remain the
  // fallback. Merges re-key this onto the survivor; ON DELETE SET NULL is the safety net that degrades an
  // orphaned verdict to target-fallback matching instead of destroying it (parent §4.1).
  @ForeignKeyColumn(() => FaceIdentityTable, { onDelete: 'SET NULL', index: false, nullable: true })
  identityId!: string | null;

  @ForeignKeyColumn(() => AssetFaceTable, { onDelete: 'CASCADE', index: false })
  assetFaceId!: string;

  // Scan artifact, meaningful only for queue rows. NULL for cleanup-sourced verdicts, which keeps them out
  // of the suggestion band read (NULL fails both `> maxDistance` and `<= suggestionMaxDistance`).
  @Column({ type: 'double precision', nullable: true })
  distance!: number | null;

  @Column({ type: 'character varying', default: 'pending' })
  status!: Generated<FacePersonVerdictStatus>;

  @Column({ type: 'character varying', default: 'suggestion' })
  source!: Generated<FacePersonVerdictSource>;

  @ForeignKeyColumn(() => UserTable, { onDelete: 'SET NULL', index: false, nullable: true })
  actorId!: string | null;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;

  @UpdateDateColumn()
  updatedAt!: Generated<Timestamp>;

  @UpdateIdColumn({ index: true })
  updateId!: Generated<string>;
}
