import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

import { UserProfile, UserStatus } from '../../users/entities/user-profile.entity';
import { UserCredential, CredentialStatus } from '../../iam/entities/user-credential.entity';

export interface EmailPayload {
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  replyTo?: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

@Injectable()
export class EmailNotificationProvider {
  private readonly logger = new Logger(EmailNotificationProvider.name);
  private transporter: Transporter | null = null;

  constructor(
    @InjectRepository(UserProfile)
    private readonly profileRepo: Repository<UserProfile>,
    @InjectRepository(UserCredential)
    private readonly credentialRepo: Repository<UserCredential>,
    private readonly config: ConfigService,
  ) {}

  async send(payload: EmailPayload): Promise<EmailResult> {
    if (!this.config.get<boolean>('smtp.enabled', false)) {
      throw new Error('SMTP notification delivery is disabled');
    }

    try {
      const transporter = this.getTransporter();
      const info = await transporter.sendMail({
        from: this.config.get<string>('smtp.from', 'no-reply@coescd.local'),
        to: payload.to,
        subject: payload.subject,
        html: payload.htmlBody,
        text: payload.textBody,
        replyTo: payload.replyTo || this.config.get<string>('smtp.replyTo') || undefined,
      });

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Email delivery failed: ${message}`);
      return { success: false, error: message };
    }
  }

  async resolveEmailAddress(userId: string): Promise<string | null> {
    const { credential, profile } = await this.resolveUserContext(userId);
    if (!credential || credential.status !== CredentialStatus.ACTIVE || credential.isServiceAccount) {
      return null;
    }

    if (profile && profile.status === UserStatus.ACTIVE && profile.email) {
      return profile.email.trim().toLowerCase();
    }

    return credential.email?.trim().toLowerCase() || null;
  }

  private async resolveUserContext(
    userId: string,
  ): Promise<{ credential: UserCredential | null; profile: UserProfile | null }> {
    const directCredential = await this.credentialRepo.findOne({ where: { id: userId } });
    if (directCredential) {
      const profile = await this.profileRepo.findOne({ where: { credentialId: directCredential.id } });
      return { credential: directCredential, profile };
    }

    const profile = await this.profileRepo.findOne({
      where: [{ id: userId }, { credentialId: userId }],
    });
    if (!profile) {
      return { credential: null, profile: null };
    }

    const credential = await this.credentialRepo.findOne({ where: { id: profile.credentialId } });
    return { credential, profile };
  }

  private getTransporter(): Transporter {
    if (!this.transporter) {
      const username = this.config.get<string>('smtp.username', '');
      const password = this.config.get<string>('smtp.password', '');

      this.transporter = nodemailer.createTransport({
        host: this.config.get<string>('smtp.host', 'localhost'),
        port: this.config.get<number>('smtp.port', 587),
        secure: this.config.get<boolean>('smtp.secure', false),
        requireTLS: this.config.get<boolean>('smtp.requireTls', false),
        ignoreTLS: this.config.get<boolean>('smtp.ignoreTls', false),
        connectionTimeout: this.config.get<number>('smtp.connectionTimeoutMs', 10000),
        auth: username ? { user: username, pass: password } : undefined,
      });
    }

    return this.transporter;
  }
}
