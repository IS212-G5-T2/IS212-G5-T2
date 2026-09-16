import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { AuthController } from './auth/auth.controller.js';
import { FirebaseAuthenticationMiddleware } from './auth/authentication/firebase-authentication.middleware.js';

@Module({
  imports: [AuthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(FirebaseAuthenticationMiddleware).forRoutes(AuthController);
  }
}
