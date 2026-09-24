import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { loadEnvironment } from './config/load-environment.js';
import { AppModule } from './app.module.js';

// The frontend caps attachments at 50MB of raw file bytes, but files reach
// this service base64-encoded inside JSON `data:` URLs, which inflates them by
// ~33% (plus the surrounding event fields). The body cap must clear that
// encoded size so a valid 50MB upload isn't rejected with a 413:
// 50MB * 4/3 ≈ 66.7MB, and 80MB leaves comfortable headroom for the JSON
// envelope on top of the encoded payload.
const MAX_BODY_SIZE = '80mb';

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
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Demo-Role'],
  });
  app.useBodyParser('json', { limit: MAX_BODY_SIZE });
  app.useBodyParser('urlencoded', { limit: MAX_BODY_SIZE, extended: true });
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
