/*
 * Wires the authenticated-user route, Firebase token verification, and RBAC
 * database helpers.
 */
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { AuthController } from './auth.controller.js';
import { FirebaseAuthenticationMiddleware } from './authentication/firebase-authentication.middleware.js';
import { FirebaseTokenService } from './authentication/firebase-token.service.js';
import { RbacRepository } from './authorization/rbac.repository.js';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
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
 * Provides authentication and authorization building blocks to the backend.
 */
export class AuthModule {}
