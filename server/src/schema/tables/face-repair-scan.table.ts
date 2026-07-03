import { Column, CreateDateColumn, ForeignKeyColumn, Generated, Table, Timestamp } from '@immich/sql-tools';
import { PrimaryGeneratedUuidV7Column } from 'src/decorators';
import {
  RepairScanParams,
  RepairScanPerson,
  RepairScanProgress,
  RepairScanTotals,
} from 'src/repositories/face-repair-scan.repository';
import { UserTable } from 'src/schema/tables/user.table';

@Table('face_repair_scan')
export class FaceRepairScanTable {
  @PrimaryGeneratedUuidV7Column()
  id!: Generated<string>;

  @Column({ type: 'character varying', default: 'pending' })
  status!: Generated<string>;

  @ForeignKeyColumn(() => UserTable, { onDelete: 'SET NULL', nullable: true, index: false })
  requestedBy!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  params!: RepairScanParams | null;

  @Column({ type: 'jsonb', nullable: true })
  totals!: RepairScanTotals | null;

  @Column({ type: 'jsonb', default: '[]' })
  persons!: Generated<RepairScanPerson[]>;

  @Column({ type: 'jsonb', nullable: true })
  progress!: RepairScanProgress | null;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  startedAt!: Timestamp | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  finishedAt!: Timestamp | null;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;
}
