/*
 * Exposes the shared database service so feature modules reuse one PostgreSQL
 * pool instead of creating their own connections.
 */
import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service.js';

@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
