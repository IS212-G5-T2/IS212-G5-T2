import { NestFactory } from '@nestjs/core';
import { loadEnvironment } from './config/load-environment.js';
import { AppModule } from './app.module.js';

async function bootstrap() {
  loadEnvironment();
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
    allowedHeaders: ['Authorization', 'Content-Type'],
  });
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
