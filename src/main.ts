import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import cookieParser = require('cookie-parser');
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const port = config.get<number>('port', 3000);

  app.use(cookieParser());
  app.set('trust proxy', 1);

  // ── Swagger / OpenAPI ────────────────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Akwam Scraper API')
    .setDescription(
      'REST API for scraping movies and TV-series metadata & download links from ak.sv.\n\n' +
      '**Two usage modes:**\n' +
      '- **Async (recommended):** `POST /akwam/jobs` → `GET /akwam/jobs/:id/events` (SSE) → `POST /akwam/jobs/:id/start`\n' +
      '- **Sync (legacy):** `POST /akwam?search=...` — blocks until all results are ready.',
    )
    .setVersion('1.0.0')
    .addCookieAuth('access_queue', {
      type: 'apiKey',
      in: 'cookie',
      name: 'access_queue',
      description: 'Admin bypass cookie — skips the BullMQ queue',
    })
    .addTag('jobs', 'Async job-based scraping (recommended)')
    .addTag('legacy', 'Synchronous single-request scraping')
    .addTag('utils', 'Utility endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'Akwam API Docs',
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  app.useStaticAssets(join(__dirname, '..', 'public'), {
    index: 'index.html',
  });

  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Server running on http://0.0.0.0:${port}`);
  console.log(`📚 Swagger docs at http://0.0.0.0:${port}/api/docs`);
}

bootstrap();
