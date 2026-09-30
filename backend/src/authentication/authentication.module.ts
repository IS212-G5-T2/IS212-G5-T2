import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { AuthController } from './auth.controller.js';
import { AuthenticationMiddleware } from './authentication.middleware.js';
import { AuthRepository } from './repositories/auth.repository.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [AuthRepository, AuthService, AuthenticationMiddleware],
  exports: [AuthService, AuthenticationMiddleware],
})
export class AuthenticationModule {}
