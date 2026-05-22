import { Module } from '@nestjs/common';
import { AkwamController } from './akwam.controller';
import { AkwamService } from './akwam.service';

@Module({
  controllers: [AkwamController],
  providers: [AkwamService],
})
export class AkwamModule {}
