// Real API browser harness, restricted to an explicitly selected test database.
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import { readFile } from 'node:fs/promises';
import { AppModule } from '../../dist/app.module.js';

if (process.env.NODE_ENV !== 'test' || !process.env.TEST_DATABASE_URL) {
  throw new Error('Browser fixture requires NODE_ENV=test and TEST_DATABASE_URL.');
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
await pool.query(await readFile(new URL('../../migrations/001_event_requests.sql', import.meta.url), 'utf8'));
const ids = new Set();
const app = await NestFactory.create(AppModule, { logger: false });
app.use((req, _res, next) => {
  const match = req.url.match(/^\/event-requests\/([0-9a-f-]{36})\/draft$/i);
  if (req.method === 'PUT' && match) ids.add(match[1]);
  next();
});
await app.listen(3001, '127.0.0.1');
console.log('Anonymous draft test API listening on 127.0.0.1:3001');
async function close() {
  await app.close();
  await pool.query('DELETE FROM event_requests WHERE id = ANY($1::uuid[])', [[...ids]]);
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
