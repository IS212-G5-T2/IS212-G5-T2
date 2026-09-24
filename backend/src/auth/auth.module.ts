import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { AuthController } from './authentication/auth.controller.js';
import { AuthenticationMiddleware } from './authentication/authentication.middleware.js';
import { AuthRepository } from './authentication/auth.repository.js';
import { AuthService } from './authentication/auth.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [AuthRepository, AuthService, AuthenticationMiddleware],
  exports: [AuthService, AuthenticationMiddleware],
})
export class AuthModule {}
