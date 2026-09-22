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

const { Pool } = pg;

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
    return this.getPool().query<T>(text, params);
  }

  async transaction<T>(
    work: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.getPool().connect();

    try {
      await client.query('BEGIN');
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
