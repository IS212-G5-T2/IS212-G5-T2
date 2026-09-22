/*
 * Unit tests for database configuration failure paths that repositories depend
 * on for consistent error behavior.
 */
import { InternalServerErrorException } from '@nestjs/common';
import { vi } from 'vitest';
import { DatabaseService } from './database.service.js';

const poolMocks = vi.hoisted(() => ({
  connect: vi.fn(),
  end: vi.fn(),
  pool: vi.fn(),
  query: vi.fn(),
}));

vi.mock('pg', () => ({
  default: {
    Pool: poolMocks.pool,
  },
}));

describe('DatabaseService', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    poolMocks.pool.mockImplementation(function () {
      return {
        connect: poolMocks.connect,
        end: poolMocks.end,
        query: poolMocks.query,
      };
    });
  });

  afterEach(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  describe('intended behavior', () => {
    it('runs queries with their parameters', async () => {
      process.env.DATABASE_URL = 'postgresql://app:secret@localhost:5432/app';
      const result = { rows: [{ id: 1 }] };
      poolMocks.query.mockResolvedValueOnce(result);
      const database = new DatabaseService();

      await expect(database.query('SELECT $1', [1])).resolves.toBe(result);
      expect(poolMocks.query).toHaveBeenCalledWith('SELECT $1', [1]);
    });

    it('commits successful transactions and releases the client', async () => {
      process.env.DATABASE_URL = 'postgresql://app:secret@localhost:5432/app';
      const client = {
        query: vi.fn().mockResolvedValue(undefined),
        release: vi.fn(),
      };
      poolMocks.connect.mockResolvedValueOnce(client);
      const database = new DatabaseService();

      await expect(
        database.transaction(async (transactionClient) => {
          expect(transactionClient).toBe(client);
          return 'completed';
        }),
      ).resolves.toBe('completed');
      expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
      expect(client.query).toHaveBeenNthCalledWith(2, 'COMMIT');
      expect(client.release).toHaveBeenCalledOnce();
    });

    it('ends the pool during module shutdown', async () => {
      process.env.DATABASE_URL = 'postgresql://app:secret@localhost:5432/app';
      poolMocks.end.mockResolvedValueOnce(undefined);
      const database = new DatabaseService();

      await database.onModuleDestroy();

      expect(poolMocks.end).toHaveBeenCalledOnce();
    });
  });

  describe('unintended behavior', () => {
    it('requires DATABASE_URL before running queries', async () => {
      delete process.env.DATABASE_URL;
      const database = new DatabaseService();

      await expect(database.query('SELECT 1')).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(poolMocks.pool).not.toHaveBeenCalled();
    });

    it('requires DATABASE_URL before starting transactions', async () => {
      delete process.env.DATABASE_URL;
      const database = new DatabaseService();

      await expect(database.transaction(async () => undefined)).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(poolMocks.pool).not.toHaveBeenCalled();
    });

    it('surfaces connection errors when DATABASE_URL points to the wrong database', async () => {
      process.env.DATABASE_URL =
        'postgresql://app:secret@invalid-database-host:5432/missing';
      const connectionError = new Error(
        'getaddrinfo ENOTFOUND invalid-database-host',
      );
      poolMocks.query.mockRejectedValueOnce(connectionError);
      const database = new DatabaseService();

      await expect(database.query('SELECT 1')).rejects.toBe(connectionError);
      expect(poolMocks.pool).toHaveBeenCalledWith({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 5_000,
        idleTimeoutMillis: 30_000,
        query_timeout: 10_000,
        max: 10,
      });
    });

    it('rolls back failed transactions and releases the client', async () => {
      process.env.DATABASE_URL = 'postgresql://app:secret@localhost:5432/app';
      const client = {
        query: vi.fn().mockResolvedValue(undefined),
        release: vi.fn(),
      };
      const workError = new Error('work failed');
      poolMocks.connect.mockResolvedValueOnce(client);
      const database = new DatabaseService();

      await expect(
        database.transaction(async () => {
          throw workError;
        }),
      ).rejects.toBe(workError);
      expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
      expect(client.query).toHaveBeenNthCalledWith(2, 'ROLLBACK');
      expect(client.release).toHaveBeenCalledOnce();
    });

    it('does not end a pool that was never configured', async () => {
      delete process.env.DATABASE_URL;
      const database = new DatabaseService();

      await database.onModuleDestroy();

      expect(poolMocks.end).not.toHaveBeenCalled();
    });
  });
});
