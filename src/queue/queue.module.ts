import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { UserRateLimitGuard } from './user-rate-limit.guard';
import { QueueBypassMiddleware } from './queue-bypass.middleware';

@Module({
  providers: [
    UserRateLimitGuard,
    QueueBypassMiddleware,
  ],
  exports: [UserRateLimitGuard],
})
export class QueueModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(QueueBypassMiddleware).forRoutes('*');
  }
}
