import { Module } from '@nestjs/common';
import { AkwamModule } from './akwam/akwam.module';

@Module({
  imports: [AkwamModule],
})
export class AppModule {}
