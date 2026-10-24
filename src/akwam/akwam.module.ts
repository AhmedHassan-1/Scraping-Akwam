import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { RedisModule } from '../redis/redis.module';

// Presentation Controllers
import { AkwamJobsController } from '../presentation/controllers/akwam-jobs.controller';
import { AkwamLegacyController } from '../presentation/controllers/akwam-legacy.controller';
import { AkwamProxyController } from '../presentation/controllers/akwam-proxy.controller';
import { HealthController } from '../presentation/controllers/health.controller';

// Application Use Cases
import { CreateJobUseCase } from '../application/use-cases/create-job.use-case';
import { GetJobSnapshotUseCase } from '../application/use-cases/get-job-snapshot.use-case';
import { StartProcessingUseCase } from '../application/use-cases/start-processing.use-case';
import { CancelJobUseCase } from '../application/use-cases/cancel-job.use-case';
import { ProxyImageUseCase } from '../application/use-cases/proxy-image.use-case';
import { SyncSearchUseCase } from '../application/use-cases/sync-search.use-case';

// Infrastructure Services (Clean Architecture: Split Services)
import { AkwamHttpClient } from '../infrastructure/scraping/akwam-http-client.service';
import { AkwamSearchService } from '../infrastructure/scraping/akwam-search.service';
import { AkwamDownloadResolverService } from '../infrastructure/scraping/akwam-download-resolver.service';
import { AkwamMediaService } from '../infrastructure/scraping/akwam-media.service';
import { AkwamImageProxyService } from '../infrastructure/scraping/akwam-image-proxy.service';
import { LegacyResponseFormatter } from '../infrastructure/scraping/legacy-response-formatter.service';
import { AkwamHtmlScraperService } from '../infrastructure/scraping/akwam-html-scraper.service';

// Infrastructure Persistence & Queue
import { RedisJobRepository } from '../infrastructure/persistence/redis-job.repository';
import { RedisImageCacheService } from '../infrastructure/persistence/redis-image-cache.service';
import { TokenBucketRateLimiterService } from '../infrastructure/queue/token-bucket-rate-limiter.service';
import { BullMqQueueService } from '../infrastructure/queue/bullmq-queue.service';
import { AkwamJobProcessor } from '../infrastructure/queue/akwam-job.processor';

@Module({
  imports: [QueueModule, RedisModule],
  controllers: [
    AkwamJobsController,
    AkwamLegacyController,
    AkwamProxyController,
    HealthController,
  ],
  providers: [
    // Application Use Cases
    CreateJobUseCase,
    GetJobSnapshotUseCase,
    StartProcessingUseCase,
    CancelJobUseCase,
    ProxyImageUseCase,
    SyncSearchUseCase,

    // Specialized Scraping Services
    AkwamHttpClient,
    AkwamSearchService,
    AkwamDownloadResolverService,
    AkwamMediaService,
    AkwamImageProxyService,
    LegacyResponseFormatter,
    AkwamHtmlScraperService,

    // Core Interface Bindings
    {
      provide: 'IScraperService',
      useClass: AkwamHtmlScraperService,
    },
    {
      provide: 'ISraperService',
      useClass: AkwamHtmlScraperService,
    },
    {
      provide: 'IJobRepository',
      useClass: RedisJobRepository,
    },
    {
      provide: 'IImageCache',
      useClass: RedisImageCacheService,
    },
    {
      provide: 'IRateLimiter',
      useClass: TokenBucketRateLimiterService,
    },
    {
      provide: 'IQueueProvider',
      useClass: BullMqQueueService,
    },
    BullMqQueueService,
    AkwamJobProcessor,
  ],
  exports: ['IScraperService', 'ISraperService', 'IJobRepository'],
})
export class AkwamModule {}
