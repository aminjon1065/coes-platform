import { Module } from '@nestjs/common';
import type { CacheStore } from '@nestjs/common/cache/interfaces/cache-manager.interface';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';
import { ScheduleModule } from '@nestjs/schedule';
import { redisStore } from 'cache-manager-ioredis-yet';

import { IamModule } from './modules/iam/iam.module';
import { OrgModule } from './modules/org/org.module';
import { UsersModule } from './modules/users/users.module';
import { AuthorizationModule } from './modules/authorization/authorization.module';
import { AuditModule } from './modules/audit/audit.module';
import { EdmsModule } from './modules/edms/edms.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { FilesModule } from './modules/files/files.module';
import { ChatModule } from './modules/chat/chat.module';
import { SearchModule } from './modules/search/search.module';
import { CallsModule } from './modules/calls/calls.module';
import { GisModule } from './modules/gis/gis.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { MlModule } from './modules/ml/ml.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { OutboxModule } from './modules/outbox/outbox.module';
import { InboxModule } from './modules/inbox/inbox.module';
import { validateConfig } from './infra/config/config.validation';
import databaseConfig from './infra/config/database.config';
import redisConfig from './infra/config/redis.config';
import jwtConfig from './infra/config/jwt.config';
import minioConfig from './infra/config/minio.config';
import opensearchConfig from './infra/config/opensearch.config';
import clamavConfig from './infra/config/clamav.config';
import smtpConfig from './infra/config/smtp.config';
import smsConfig from './infra/config/sms.config';
import telegramConfig from './infra/config/telegram.config';
import webpushConfig from './infra/config/webpush.config';
import { HealthController } from './health.controller';
import { existsSync } from 'fs';
import { join } from 'path';

const envFilePath = [
  join(process.cwd(), '.env.local'),
  join(process.cwd(), '.env'),
  join(process.cwd(), '..', '..', '.env.local'),
  join(process.cwd(), '..', '..', '.env'),
].filter((path) => existsSync(path));

@Module({
  controllers: [HealthController],
  imports: [
    // Configuration — load first, validate eagerly
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateConfig,
      load: [
        databaseConfig,
        redisConfig,
        jwtConfig,
        minioConfig,
        opensearchConfig,
        clamavConfig,
        smtpConfig,
        smsConfig,
        telegramConfig,
        webpushConfig,
      ],
      envFilePath,
    }),

    // Database
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('database.host'),
        port: config.get<number>('database.port'),
        username: config.get<string>('database.username'),
        password: config.get<string>('database.password'),
        database: config.get<string>('database.name'),
        schema: 'public',
        autoLoadEntities: true,
        synchronize: false, // Always use migrations
        logging: config.get<string>('NODE_ENV') === 'development',
        ssl: config.get<boolean>('database.ssl', false)
          ? { rejectUnauthorized: true }
          : false,
      }),
    }),

    // Redis cache
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const store = await redisStore({
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
          password: config.get<string>('redis.password'),
          ttl: 300_000, // cache-manager v5: milliseconds
        });

        return {
          store: store as unknown as CacheStore,
          ttl: 300_000, // 5 minutes in ms
        };
      },
    }),

    // Domain event bus (in-process; promotable to RabbitMQ)
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 20,
    }),

    // Task scheduling (cron jobs)
    ScheduleModule.forRoot(),

    OutboxModule,
    InboxModule,

    // Rate limiting
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('THROTTLE_TTL', 60000),
            limit: config.get<number>('THROTTLE_LIMIT', 100),
          },
        ],
      }),
    }),

    // Domain modules
    IamModule,
    OrgModule,
    UsersModule,
    AuthorizationModule,
    AuditModule,
    EdmsModule,
    TasksModule,
    NotificationsModule,
    FilesModule,
    ChatModule,
    SearchModule,
    CallsModule,
    GisModule,
    AnalyticsModule,
    MlModule,
    ReportingModule,
  ],
})
export class AppModule {}
