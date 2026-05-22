import { Module } from '@nestjs/common';
import { AkwamController } from './akwam.controller';
import { AkwamService } from './akwam.service';
import { AkwamJobsService } from './akwam-jobs.service';

@Module({
  controllers: [AkwamController],
  providers: [AkwamService, AkwamJobsService],
})
export class AkwamModule {}
