import 'reflect-metadata';
import 'dotenv/config';
import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { APP_CONFIG, AppConfig } from './config/configuration';
import { configureApp } from './bootstrap';

async function bootstrap() {
  const json = process.env.LOG_FORMAT !== 'pretty';
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true, // needed for webhook signature verification
    logger: new ConsoleLogger({ json, colors: !json, prefix: 'academy-api' }),
  });
  const config = app.get<AppConfig>(APP_CONFIG);
  app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
  configureApp(app, config);
  app.enableShutdownHooks();
  await app.listen(config.port);
  new Logger('Bootstrap').log(`API listening on :${config.port}/${config.apiPrefix}`);
}

void bootstrap();
