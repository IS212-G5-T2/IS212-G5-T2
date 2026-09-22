import pg from 'pg';
import { readFile } from 'node:fs/promises';

if (!process.env.DATABASE_URL)
  throw new Error('Set DATABASE_URL before running this migration.');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query(
    await readFile(
      new URL('../migrations/001_event_drafts.sql', import.meta.url),
      'utf8',
    ),
  );
  console.log('Draft migration applied. Existing event records preserved.');
} finally {
  await client.end();
}
