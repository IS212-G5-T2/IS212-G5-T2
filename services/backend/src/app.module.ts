import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { FirebaseAuthenticationMiddleware } from './auth/authentication/firebase-authentication.middleware.js';

@Module({
  imports: [AuthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(FirebaseAuthenticationMiddleware).forRoutes({
      path: '',
      method: RequestMethod.GET
    });
  }
}
