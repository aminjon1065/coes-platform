import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * The formal act of registration — a one-time, irreversible event.
 * Captures who registered the document, when, under which series,
 * and what number was assigned. Never updated or deleted.
 */
@Entity({ name: 'registration_records', schema: 'edms' })
@Index(['documentId'], { unique: true })
@Index(['seriesCode', 'sequenceNumber', 'year'], { unique: true })
export class RegistrationRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId: string;

  @Column({ name: 'registration_number', length: 50 })
  registrationNumber: string;

  @Column({ name: 'series_code', length: 20 })
  seriesCode: string;

  @Column({ name: 'sequence_number' })
  sequenceNumber: number;

  @Column({ type: 'smallint' })
  year: number;

  /** The user (credentialId) who performed the registration */
  @Column({ name: 'registrar_id', type: 'uuid' })
  registrarId: string;

  /** The position from which registration was performed */
  @Column({ name: 'registrar_position_id', type: 'uuid', nullable: true })
  registrarPositionId: string | null;

  @CreateDateColumn({ name: 'registered_at', type: 'timestamptz' })
  registeredAt: Date;
}
