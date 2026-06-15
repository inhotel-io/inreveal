import { Column, CreateDateColumn, Generated, Table, Timestamp } from '@immich/sql-tools';
import { PrimaryGeneratedUuidV7Column } from 'src/decorators';

// Gated grant-revocation audit: one row per (album, user) who has lost all
// paths. In A3, the consumer trigger shared_space_album_user_delete_after_audit
// (AFTER INSERT on this table) deletes the grant row; SharedSpaceAlbumSync.getDeletes
// (A4) also reads it. FK-less append log. Mirrors library_audit (minus the trigger,
// which A3 adds).
@Table('shared_space_album_user_audit')
export class SharedSpaceAlbumUserAuditTable {
  @PrimaryGeneratedUuidV7Column()
  id!: Generated<string>;

  @Column({ type: 'uuid', index: true })
  albumId!: string;

  @Column({ type: 'uuid', index: true })
  userId!: string;

  @CreateDateColumn({ default: () => 'clock_timestamp()', index: true })
  deletedAt!: Generated<Timestamp>;
}
