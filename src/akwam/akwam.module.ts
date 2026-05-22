import { Module } from '@nestjs/common';
import { AkwamController } from './akwam.controller';
import { AkwamService } from './akwam.service';
import { AkwamJobsService } from './akwam-jobs.service';
import { AkwamQueueService } from './akwam-queue.service';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [QueueModule],
  controllers: [AkwamController],
  providers: [AkwamService, AkwamJobsService, AkwamQueueService],
})
export class AkwamModule {}
