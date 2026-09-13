import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';

if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL before running migrations.');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  await pool.query(await readFile(new URL('../migrations/001_event_requests.sql', import.meta.url), 'utf8'));
  console.log('Event request migration applied.');
} finally { await pool.end(); }
