import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true }),
  );

  const config = app.get(ConfigService);

  // Multipart file uploads — required by FilesController
  await app.register(require('@fastify/multipart'), {
    limits: {
      fileSize: 100 * 1024 * 1024, // 100 MB
      files: 1,                     // one file per request
    },
  });

  // Global prefix
  app.setGlobalPrefix('api');

  // API versioning
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // CORS — internal only; restrict origins in production via config
  app.enableCors({
    origin: config.get<string[]>('ALLOWED_ORIGINS', ['http://localhost:3000']),
    credentials: true,
  });

  // Swagger (disabled in production)
  if (config.get<string>('NODE_ENV') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('CoESCD Platform API')
      .setDescription('CoESCD Unified Digital Platform — Internal API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = config.get<number>('PORT', 4000);
  const host = config.get<string>('HOST', '0.0.0.0');

  await app.listen(port, host);
  console.log(`CoESCD Backend running on http://${host}:${port}/api`);
}

bootstrap();
