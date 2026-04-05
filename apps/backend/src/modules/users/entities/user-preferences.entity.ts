import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { UserProfile } from './user-profile.entity';

export enum AppLanguage {
  RU = 'ru',
  TG = 'tg',
  EN = 'en',
}

@Entity({ name: 'user_preferences', schema: 'users' })
export class UserPreferences {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @OneToOne(() => UserProfile, (u) => u.preferences, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserProfile;

  @Column({
    type: 'enum',
    enum: AppLanguage,
    default: AppLanguage.RU,
  })
  language: AppLanguage;

  @Column({ name: 'notify_email', default: true })
  notifyEmail: boolean;

  @Column({ name: 'notify_sms', default: false })
  notifySms: boolean;

  @Column({ name: 'notify_in_app', default: true })
  notifyInApp: boolean;

  /** Quiet hours — no notifications sent between these times (HH:MM format) */
  @Column({ name: 'quiet_hours_start', length: 5, nullable: true })
  quietHoursStart: string | null;

  @Column({ name: 'quiet_hours_end', length: 5, nullable: true })
  quietHoursEnd: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
