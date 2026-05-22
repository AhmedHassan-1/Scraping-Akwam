import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useStaticAssets(join(__dirname, '..', 'public'), {
    index: 'index.html',
  });

  await app.listen(3000, '0.0.0.0');
  console.log('🚀 Server running on http://0.0.0.0:3000');
}

bootstrap();
