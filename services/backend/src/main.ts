import { NestFactory } from '@nestjs/core';
import { loadEnvironment } from './config/load-environment.js';
import { AppModule } from './app.module.js';
import type { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  loadEnvironment();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '8mb' });
  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
    allowedHeaders: ['Authorization', 'Content-Type'],
  });
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
