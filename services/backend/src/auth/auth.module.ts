/*
 * Wires authentication middleware, Firebase token verification, and RBAC
 * database helpers without exposing any auth routes of its own.
 */
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { FirebaseAuthenticationMiddleware } from './authentication/firebase-authentication.middleware.js';
import { FirebaseTokenService } from './authentication/firebase-token.service.js';
import { RbacRepository } from './authorization/rbac.repository.js';

@Module({
  imports: [DatabaseModule],
  providers: [
    FirebaseTokenService,
    FirebaseAuthenticationMiddleware,
    RbacRepository,
  ],
  exports: [
    FirebaseAuthenticationMiddleware,
    FirebaseTokenService,
    RbacRepository,
  ],
})
/**
 * Provides authentication and authorization building blocks for route-owning
 * modules without registering controllers or URL paths.
 */
export class AuthModule {}
