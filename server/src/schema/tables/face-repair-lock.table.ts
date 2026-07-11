import { Column, CreateDateColumn, ForeignKeyColumn, Generated, Index, Table, Timestamp } from '@immich/sql-tools';
import { PrimaryGeneratedUuidV7Column } from 'src/decorators';
import { AssetFaceTable } from 'src/schema/tables/asset-face.table';
import { PersonTable } from 'src/schema/tables/person.table';

// A durable, OWNER-AGNOSTIC lock on a single face for the Face Cleanup console's "Confirm / lock" action
// (state 4, spec req 2). Once a face is locked here, `applyDeclineFilters` drops it from every future scan's
// flagged set regardless of which owner the scan would propose next — the age-gap childhood-photo case, where
// the same face keeps getting suspected toward different people over time. Unlike `face_repair_decline` (keyed
// per (face, suspectedOwner) pairing), the lock is keyed by face alone: the plain unique index on `assetFaceId`
// means a face can only ever have one lock row, so re-locking it (even under a different reviewed person) is a
// silent no-op via `ON CONFLICT (assetFaceId) DO NOTHING`.
@Table('face_repair_lock')
@Index({ name: 'face_repair_lock_face_uq', columns: ['assetFaceId'], unique: true })
export class FaceRepairLockTable {
  @PrimaryGeneratedUuidV7Column()
  id!: Generated<string>;

  // Already unique via the index above, so no separate FK-column index is needed.
  @ForeignKeyColumn(() => AssetFaceTable, { onDelete: 'CASCADE', index: false })
  assetFaceId!: string;

  // The person this lock was confirmed on (display/audit only — the lock check itself is owner-agnostic).
  @ForeignKeyColumn(() => PersonTable, { onDelete: 'CASCADE', index: true })
  personId!: string;

  @Column({ type: 'uuid', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;
}
