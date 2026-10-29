import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';

// The frontend caps attachments at 50MB of raw file bytes, but files reach
// this service base64-encoded inside JSON `data:` URLs, which inflates them by
// ~33% (plus the surrounding event fields). The body cap must clear that
// encoded size so a valid 50MB upload isn't rejected with a 413:
// 50MB * 4/3 ≈ 66.7MB, and 80MB leaves comfortable headroom for the JSON
// envelope on top of the encoded payload.
export const MAX_BODY_SIZE = '80mb';

/**
 * Shared HTTP setup for the running service and for the e2e harness. The app must be
 * created with `bodyParser: false` so that CORS can be registered before the parsers.
 *
 * CORS must be registered before the body parsers: an oversized request makes the parser
 * throw immediately, skipping any regular middleware registered after it. Without CORS
 * already in place, that 413 response has no Access-Control-Allow-Origin header, so a
 * cross-origin frontend (:5173 vs this service's :3000) can't read it at all.
 */
export function configureApp(app: INestApplication | NestExpressApplication) {
  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Demo-Role'],
    // SPM-63: the browser must be able to read the server-chosen export filename across origins.
    exposedHeaders: ['Content-Disposition'],
  });
  const express = app as NestExpressApplication;
  express.useBodyParser('json', { limit: MAX_BODY_SIZE });
  express.useBodyParser('urlencoded', { limit: MAX_BODY_SIZE, extended: true });
  return app;
}
