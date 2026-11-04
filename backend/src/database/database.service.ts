/*
 * Owns the shared PostgreSQL pool, query helper, transaction helper, and pool
 * shutdown behavior for backend repositories.
 */
import {
  Injectable,
  InternalServerErrorException,
  OnModuleDestroy,
} from '@nestjs/common';
import pg from 'pg';
import { currentActorId } from '../common/actor-context.js';

const { Pool } = pg;

/** Statements that can change rows; a plain SELECT is sent as it is. */
export const WRITE_STATEMENT = /^\s*(INSERT|UPDATE|DELETE|WITH|MERGE)\b/i;

/** Read by the event_audit_log triggers (database/postgresql/init/032). */
export const SET_ACTOR = "SELECT set_config('app.actor_id', $1, true)";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool =
    process.env.DATABASE_URL === undefined
      ? undefined
      : new Pool({
          connectionString: process.env.DATABASE_URL,
          connectionTimeoutMillis: 5_000,
          idleTimeoutMillis: 30_000,
          query_timeout: 10_000,
          max: 10,
        });

  async query<T extends pg.QueryResultRow>(
    text: string,
    params: unknown[] = [],
  ): Promise<pg.QueryResult<T>> {
    // SPM-157: a write made for a signed-in user runs in a transaction so the audit triggers see who made it.
    if (currentActorId() !== undefined && WRITE_STATEMENT.test(text)) {
      return this.transaction((client) => client.query<T>(text, params));
    }
    return this.getPool().query<T>(text, params);
  }

  async transaction<T>(
    work: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.getPool().connect();

    try {
      await client.query('BEGIN');
      const actorId = currentActorId();
      if (actorId !== undefined) {
        // SPM-157 AC5: transaction-local, so a pooled connection never carries it to the next user.
        await client.query(SET_ACTOR, [actorId]);
      }
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }

  private getPool(): pg.Pool {
    if (!this.pool) {
      throw new InternalServerErrorException('DATABASE_URL is required');
    }

    return this.pool;
  }
}
