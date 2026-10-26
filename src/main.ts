import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import helmet from 'helmet';
import cookieParser = require('cookie-parser');
import hpp = require('hpp');
import compression = require('compression');
import express = require('express');
import { AppModule } from './app.module';
import { GlobalHttpExceptionFilter } from './presentation/filters/http-exception.filter';
import { RequestIdMiddleware } from './presentation/middlewares/request-id.middleware';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const port = config.get<number>('port', 5000);

  // Validate critical security env vars
  const bypassCookieValue = config.get<string>('queue.bypassCookieValue');
  if (!bypassCookieValue) {
    throw new Error('QUEUE_BYPASS_COOKIE_VALUE is required in environment variables');
  }

  // 1. Disable server signature
  app.disable('x-powered-by');

  // 2. Body limits (DoS protection)
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));

  // 3. Request Tracing (X-Request-Id)
  app.use(new RequestIdMiddleware().use);

  // 4. HTTP Parameter Pollution Protection
  app.use(hpp());

  // 5. Response Compression
  app.use(compression());

  // 6. Cookies
  app.use(cookieParser());

  // 7. Hardened Security Headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            "'unsafe-eval'",
            'https://cdnjs.cloudflare.com',
            'https://cdn.jsdelivr.net',
          ],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            'https://fonts.googleapis.com',
            'https://cdn.jsdelivr.net',
          ],
          imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          connectSrc: ["'self'", 'http:', 'https:'],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allows image proxying to external clients
      crossOriginEmbedderPolicy: false,
      frameguard: { action: 'sameorigin' }, // Clickjacking protection
      dnsPrefetchControl: { allow: false },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  // 8. CORS configuration
  const corsOrigin = process.env.CORS_ORIGIN;
  app.enableCors({
    origin: corsOrigin
      ? corsOrigin.split(',').map((o) => o.trim())
      : (origin, callback) => callback(null, true),
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Requested-With',
      'X-Request-Id',
      'Cookie',
    ],
    credentials: true,
    maxAge: 86400,
  });

  // 9. Trust Reverse Proxy (Cloudflare / Nginx / Traefik / Render)
  app.set('trust proxy', 1);

  // 10. Strict Professional Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      stopAtFirstError: false,
      exceptionFactory: (errors) => {
        const messages = errors.map((err) => {
          const constraints = err.constraints
            ? Object.values(err.constraints)
            : [];
          return constraints.length > 0
            ? constraints.join(', ')
            : `الحقل ${err.property} غير صالح`;
        });
        return new BadRequestException(messages);
      },
    }),
  );

  // 11. Global Exception Filter with Error Masking
  app.useGlobalFilters(new GlobalHttpExceptionFilter());

  // 12. Graceful Shutdown Hooks
  app.enableShutdownHooks();

  // ── Swagger / OpenAPI ────────────────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('🎬 Akwam Scraper API (Clean Architecture & Hardened Security)')
    .setDescription(
      `### واجهة برمجة التطبيقات لجلب وسائط وروابط موقع أكوام (ak.sv)
معمارية نظيفة مبنية بـ **NestJS** و **Upstash Redis** و **BullMQ** تتيح البحث واستخراج بيانات الأفلام والمسلسلات وروابط التحميل المباشرة بمختلف الجودات مع بث تقدم حي عبر Server-Sent Events (SSE).

---

### 🚀 أنماط الاستخدام (Usage Modes):
1. **النمط غير التزامني الموصى به (Async Job Flow):**
   - **الخطوة 1:** إنشاء مهمة بحث \`POST /akwam/jobs\` والحصول على معرّف المهمة (\`id\`).
   - **الخطوة 2:** متابعة التحديثات المباشرة عبر SSE: \`GET /akwam/jobs/:id/events\` (أو الاستعلام الدوري \`GET /akwam/jobs/:id\`).
   - **الخطوة 3:** عند وصول الحالة إلى \`awaiting_selection\`، أرسل معرفات العناصر المراد معالجتها عبر \`POST /akwam/jobs/:id/start\`.
   - **الخطوة 4:** استلام الروابط المباشرة وتفاصيل الجودات عند وصول الحالة إلى \`completed\`.

2. **النمط التزامني القديم (Legacy Synchronous Flow):**
   - \`POST /akwam?search=...\` يقوم بالبحث والمعالجة والانتظار حتى انتهاء كافة العمليات وإرجاع النتائج دفعة واحدة.

---

### 🛡️ منظومة الأمان والتحقق المتقدمة (Security Stack):
- **حماية من XSS وحقن النصوص:** تعقيم وحذف null bytes والوسوم البرمجية عبر Transform Decorators.
- **حماية من تلوث البارامترات (HPP):** حظر وتوحيد مصفوفات الاستعلام عبر مكوّن \`hpp\`.
- **حظر هجمات الحرمان من الخدمة (Body Limit):** تحديد سقف 100 كيلوبايت لحجم حمولة الـ JSON.
- **حماية متقدمة من SSRF و DNS Rebinding:** فحص الـ DNS والتأكد من عدم الإشارة لعناوين الـ IP الخاصة أو Cloud Metadata (\`169.254.169.254\`).
- **حماية من Clickjacking والتنصت:** ترويسات أمنية صارمة عبر \`helmet\` و Content Security Policy.
- **تتبع الطلبات (X-Request-Id):** تعيين وتمرير معرّف فريد لكل طلب في الـ Headers ورسائل الاستجابة.
- **مقاومة هجمات التوقيت (Timing-Attack Safe):** التحقق من كوكي الأدمن بدقة ثابتة \`crypto.timingSafeEqual\`.`,
    )
    .setVersion('2.0.0')
    .setContact('Akwam Scraper Dev Team', 'https://github.com/AhmedHassan', 'dev@example.com')
    .setLicense('MIT', 'https://opensource.org/licenses/MIT')
    .addServer(`http://localhost:${port}`, 'Local Development Server')
    .addCookieAuth('access_queue', {
      type: 'apiKey',
      in: 'cookie',
      name: 'access_queue',
      description: 'Admin bypass cookie — تخطي طابور الانتظار وتجاوز حد الطلبات',
    })
    .addTag('jobs', 'إدارة المهام غير التزامنية (Async Job Lifecycle & SSE)')
    .addTag('legacy', 'النمط التزامني القديم المباشر (Synchronous Search)')
    .addTag('utils', 'أدوات مساعدة: فحص الحالة وبروكسي الصور الآمن (Health & Safe Proxy)')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'Akwam API Documentation',
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      docExpansion: 'list',
      filter: true,
      displayRequestDuration: true,
    },
  });

  app.useStaticAssets(join(__dirname, '..', 'public'), {
    index: 'index.html',
  });

  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Server running on http://0.0.0.0:${port}`);
  console.log(`📚 Swagger docs at http://0.0.0.0:${port}/api/docs`);
}

// Safety net for transient network/TLS resets (e.g. idle remote Redis socket reset)
process.on('unhandledRejection', (reason: any) => {
  const msg = reason?.message || String(reason);
  if (msg.includes('ECONNRESET') || msg.includes('read ECONNRESET')) {
    console.warn('Recovered from transient TLS/network socket reset:', msg);
    return;
  }
  console.error('Unhandled Rejection at:', reason);
});

process.on('uncaughtException', (err: any) => {
  const msg = err?.message || String(err);
  if (err?.code === 'ECONNRESET' || msg.includes('ECONNRESET')) {
    console.warn('Recovered from transient TLS/socket reset:', msg);
    return;
  }
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

bootstrap();
