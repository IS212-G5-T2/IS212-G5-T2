import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { loadEnvironment } from './config/load-environment.js';
import { AppModule } from './app.module.js';

const MAX_BODY_SIZE = '15mb';

async function bootstrap() {
  loadEnvironment();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  app.useBodyParser('json', { limit: MAX_BODY_SIZE });
  app.useBodyParser('urlencoded', { limit: MAX_BODY_SIZE, extended: true });
  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
    allowedHeaders: ['Authorization', 'Content-Type'],
  });
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
