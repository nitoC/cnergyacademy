import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { AppConfig } from './config/configuration';
import { CSRF_HEADER } from './common/cookies';

/** Shared HTTP setup for main.ts and integration tests. */
export function configureApp(app: INestApplication, config: AppConfig) {
  app.setGlobalPrefix(config.apiPrefix);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cookieParser());
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', CSRF_HEADER],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      stopAtFirstError: false,
    }),
  );
  if (!config.isProduction || process.env.SWAGGER_ENABLED === 'true') {
    const doc = new DocumentBuilder()
      .setTitle('Learning Academy API')
      .setDescription(
        'REST API for the academy. Browser clients authenticate with httpOnly cookies and must send the `x-academy-csrf: 1` header on state-changing requests. API clients may use a Bearer access token.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup(`${config.apiPrefix}/docs`, app, SwaggerModule.createDocument(app, doc));
  }
}
