import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ScrapeRateLimiterService } from './scrape-rate-limiter.service';
import { UserRateLimitGuard } from './user-rate-limit.guard';
import { QueueBypassMiddleware } from './queue-bypass.middleware';

@Module({
  providers: [
    ScrapeRateLimiterService,
    UserRateLimitGuard,
    QueueBypassMiddleware,
  ],
  exports: [ScrapeRateLimiterService, UserRateLimitGuard],
})
export class QueueModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(QueueBypassMiddleware).forRoutes('*');
  }
}
