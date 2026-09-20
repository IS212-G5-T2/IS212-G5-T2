import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { loadEnvironment } from './config/load-environment.js';
import { AppModule } from './app.module.js';

const MAX_BODY_SIZE = '50mb';

async function bootstrap() {
  loadEnvironment();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  // CORS must be registered before the body parsers: an oversized request
  // makes the parser throw immediately, skipping any regular middleware
  // registered after it. Without CORS already in place, that 413 response
  // has no Access-Control-Allow-Origin header, so a cross-origin frontend
  // (:5173 vs this service's :3000) can't read it at all.
  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
    allowedHeaders: ['Authorization', 'Content-Type'],
  });
  app.useBodyParser('json', { limit: MAX_BODY_SIZE });
  app.useBodyParser('urlencoded', { limit: MAX_BODY_SIZE, extended: true });
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
