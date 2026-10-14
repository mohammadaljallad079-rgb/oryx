import { ValidationPipe, VersioningType, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { cors: false });

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());

  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins,
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-oryx-company-id',
      'x-oryx-branch-id',
      'x-oryx-support-session',
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.setGlobalPrefix(process.env.API_PREFIX ?? 'api');

  // Versioned surface for the future mobile application and partners.
  // Health is version-neutral so infrastructure probes stay stable.
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  const config = new DocumentBuilder()
    .setTitle('ORYX Platform API')
    .setDescription(
      'ORYX Holding ERP, Business SaaS ERP and Automotive Ecosystem control-plane API. ' +
        'Execution 01 delivers platform governance, organizations, RBAC, modules, plans, ' +
        'subscriptions, dashboard metrics and website/application CMS.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .addGlobalParameters({
      name: 'x-oryx-company-id',
      in: 'header',
      required: false,
      description: 'Selects the company context for the request.',
    })
    .addGlobalParameters({
      name: 'x-oryx-branch-id',
      in: 'header',
      required: false,
      description: 'Selects the branch context for the request.',
    })
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  return app;
}

async function bootstrap() {
  const app = await createApp();
  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`ORYX API listening on http://localhost:${port}/api — docs at /api/docs`);
}

// Only bootstrap when executed directly (tests import createApp instead).
if (require.main === module) {
  void bootstrap();
}

export { bootstrap };
