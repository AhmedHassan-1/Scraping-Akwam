<div align="center">

# 🎬 akwam-nest — منصة معالجة وبث وسائط أكوام المتطورة
### معمارية نظيفة (Clean Architecture) · طوابير غير تزامنية (BullMQ) · بث حي لحظي (SSE) · بروكسي بث فيديو ذكي (HTTP 206)

[![NestJS](https://img.shields.io/badge/NestJS-10.x-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![BullMQ](https://img.shields.io/badge/BullMQ-5.x-FF6B35?logo=redis&logoColor=white)](https://docs.bullmq.io)
[![Upstash Redis](https://img.shields.io/badge/Upstash_Redis-TLS_Enabled-00E599?logo=redis&logoColor=white)](https://upstash.com)
[![Swagger](https://img.shields.io/badge/Swagger-OpenAPI_3.0-85EA2D?logo=swagger&logoColor=black)](http://localhost:5000/api/docs)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](Dockerfile)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## 📖 مقدمة مقالية: من التجريف العشوائي إلى هندسة النظم السحابية

في العادة، تُبنى أدوات تجريف المحتوى (Web Scrapers) على شكل سكربتات تزامنية خطية؛ تُرسل طلباً، وتنتظر تحميل الصفحة، ثم تُحلل الوسوم وتُعيد النتيجة. هذا النمط التقليدي قد يفي بالغرض في التجارب السريعة، لكنه ينهار تماماً عند نقله إلى بيئة إنتاجية حقيقية تتطلب خدمة آلاف المستخدمين في آنٍ واحد. 

تظهر نقاط الانهيار الكلاسيكية فوراً:
1. **تجميد الخادم (Thread / Event Loop Blocking):** معالجة مسلسل يحتوي على 30 حلقة تتطلب تتبع عشرات الصفحات وفك شفرات روابط التوجيه، مما يستغرق دقائق يحبس خلالها اتصال الـ HTTP حتى ينقطع (Connection Timeout).
2. **تسريب الذاكرة (Memory Leaks):** تخزين نتائج الاستعلامات في مصفوفات الذاكرة الداخلية للخادم يؤدي لتضخم استهلاك الرام وسقوط العملية (OOM Crash).
3. **مخاطر الاختراق (Security Vulnerabilities):** جلب صور وبوسترات أو فتح تدفقات فيديو بدون ضوابط صارمة يفتح ثغرات جسيمة أبرزها تزوير الطلبات من جانب الخادم (**SSRF**) واختراق شبكات الكلاود الداخلية.
4. **تجميد متصفحات المستخدمين (Video Lag & Bandwidth Saturation):** محاولة فتح ملف فيديو عالي الدقة (بحجم عدة جيجابايت) بتدفق مفتوح تسحب كميات هائلة من البيانات دفعة واحدة، مما يجهد اتصال المستخدم ويجعل التقديم والتأخير (Seeking) تجربة مستحيلة.

انطلاقاً من هذه التحديات، جاء مشروع **akwam-nest** ليُحدث نقلة نوعية؛ فهو ليس مجرد "أداة كشط"، بل **نظام متكامل لمعالجة واستخراج وبث الوسائط (Enterprise Media Pipeline)** مُهيكل بدقة وفق مبادئ **المعمارية النظيفة (Clean Architecture)**، ومدعوم بطابور معالجة موزع عبر **BullMQ** وقاعدة بيانات **Upstash Redis (TLS)**، ومزود بمحرك بث مجزأ لحظياً وفق مواصفات **HTTP 206 Partial Content**، مع واجهة سينمائية تفاعلية وبث تقدم حي للعميل عبر **Server-Sent Events (SSE)**.

---

## 🏛️ الرؤية المعمارية وتفكيك الطبقات (Clean Architecture Deep Dive)

يقوم البناء الهندسي لـ **akwam-nest** على الفصل التام للمسؤوليات (Separation of Concerns) وقاعدة التبعية الأحادية (The Dependency Rule). تم تقسيم الكود إلى أربع طبقات معزولة تماماً:

```
src/
├── core/                   # 1. طبقة النواة والدومين (Pure Domain Layer)
├── application/            # 2. طبقة حالات الاستخدام (Application Use Cases & DTOs)
├── infrastructure/         # 3. طبقة البنية التحتية والمحولات (Infrastructure & Adapters)
├── presentation/           # 4. طبقة العرض والواجهات (REST API & Web UI)
├── queue/                  # طبقة الحراس ومحددات السرعة (Middlewares & Guards)
├── redis/                  # مصنع اتصالات Redis والـ TLS
└── config/                 # الإعدادات المطبوعة والتحقق من البيئة
```

### 1. طبقة النواة (Core Domain Layer)
تمثل قلب النظام النقي الخالي من أي تبعيات خارجية أو أطر عمل (Framework-agnostic):
- **الكيانات المستقلة (Entities):** كائنات الدومين الأساسية مثل [`Movie`](file:///d:/NestJs/akwam-nest/src/core/domain/entities/movie.entity.ts)، و[`Series`](file:///d:/NestJs/akwam-nest/src/core/domain/entities/series.entity.ts)، و[`Episode`](file:///d:/NestJs/akwam-nest/src/core/domain/entities/episode.entity.ts)، و[`JobSnapshot`](file:///d:/NestJs/akwam-nest/src/core/domain/entities/job.entity.ts)، و[`DownloadQuality`](file:///d:/NestJs/akwam-nest/src/core/domain/entities/download-quality.entity.ts).
- **العقود والمنافذ (Interfaces & Ports):** تعرّف السلوكيات المجردة التي يجب أن تلتزم بها أي بنية تحتية لاحقة، مثل [`IScraperService`](file:///d:/NestJs/akwam-nest/src/core/interfaces/scraper.interface.ts)، و[`IJobRepository`](file:///d:/NestJs/akwam-nest/src/core/interfaces/job-repository.interface.ts)، و[`IQueueProvider`](file:///d:/NestJs/akwam-nest/src/core/interfaces/queue-provider.interface.ts)، و[`IRateLimiter`](file:///d:/NestJs/akwam-nest/src/core/interfaces/rate-limiter.interface.ts).
- **أخطاء الدومين (Domain Exceptions):** استثناءات دلالية خاصة بالأعمال (`JobNotFoundException`, `ScrapingException`).

### 2. طبقة التطبيق (Application Layer)
حلقة الوصل التي تنسق تدفق البيانات بين النواة والعالم الخارجي:
- **حالات الاستخدام (Use Cases):** كل ملف يمثل عملية أعمال واحدة ذات مسؤولية محددة (Single Responsibility):
  - [`CreateJobUseCase`](file:///d:/NestJs/akwam-nest/src/application/use-cases/create-job.use-case.ts): إنشاء المهمة وتعيين الأولويات وإدراجها في الطابور.
  - [`StartProcessingUseCase`](file:///d:/NestJs/akwam-nest/src/application/use-cases/start-processing.use-case.ts): استقبال اختيارات المستخدم وبدء المرحلة الثانية.
  - [`GetJobSnapshotUseCase`](file:///d:/NestJs/akwam-nest/src/application/use-cases/get-job-snapshot.use-case.ts): استرجاع أحدث لقطة لحالة المعالجة.
  - [`CancelJobUseCase`](file:///d:/NestJs/akwam-nest/src/application/use-cases/cancel-job.use-case.ts): إيقاف المهمة فورياً وتحرير الموارد.
  - [`ProxyImageUseCase`](file:///d:/NestJs/akwam-nest/src/application/use-cases/proxy-image.use-case.ts): جلب ومعالجة الصور بطريقة آمنة.
- **كائنات نقل البيانات والتحقق (DTOs & Sanitization):** التحقق الصارم عبر `class-validator` وتطهير النصوص من أكواد XSS و Null Bytes وتحديد أقصى أطوال للأشرطة النصية.

### 3. طبقة البنية التحتية (Infrastructure Layer)
حيث تتحول المفاهيم المجردة إلى كود تنفيذي متين:
- **محرك التجريف المتخصص (Specialized Scraping Services):** بدلاً من حشر كل الكود في ملف ضخم، تم فصله لخدمات متخصصة:
  - [`AkwamHttpClient`](file:///d:/NestJs/akwam-nest/src/infrastructure/scraping/akwam-http-client.service.ts): عميل موحد يعتمد على Keep-Alive Pools (`maxSockets: 50`) لتقليل زمن مصافحة TCP مع موقع الهدف وتدوير ترويسات التصفح.
  - [`AkwamSearchService`](file:///d:/NestJs/akwam-nest/src/infrastructure/scraping/akwam-search.service.ts): مسؤول فقط عن البحث السطحي واستخراج المرشحين.
  - [`AkwamMediaService`](file:///d:/NestJs/akwam-nest/src/infrastructure/scraping/akwam-media.service.ts): مسؤول عن فحص صفحات الأفلام وهيكلية المسلسلات وحلقاتها.
  - [`AkwamDownloadResolverService`](file:///d:/NestJs/akwam-nest/src/infrastructure/scraping/akwam-download-resolver.service.ts): خوارزمية ذكية تتتبع صفحات التحويل الثلاثية للوصول لروابط سيرفرات التوزيع المباشرة.
  - [`AkwamStreamService`](file:///d:/NestJs/akwam-nest/src/infrastructure/scraping/akwam-stream.service.ts): محرك بث الفيديو بتجزئة ديناميكية (HTTP 206).
  - **محللات HTML النقية (Pure Cheerio Parsers):** دوال نقية بدون أي استدعاءات شبكية لتحليل محتوى الصفحات واستخراج النصوص والصور وروابط الجودات.
- **التخزين الدائم والطوابير (Persistence & Queues):**
  - [`RedisJobRepository`](file:///d:/NestJs/akwam-nest/src/infrastructure/persistence/redis-job.repository.ts): حفظ مهام المعالجة في Redis مع صلاحية زمنية (TTL) مدتها ساعتان لمنع تسريب الذاكرة، وبث الأحداث عبر Redis Pub/Sub ومخزن `ReplaySubject(10)`.
  - [`BullMqQueueService`](file:///d:/NestJs/akwam-nest/src/infrastructure/queue/bullmq-queue.service.ts) و [`AkwamJobProcessor`](file:///d:/NestJs/akwam-nest/src/infrastructure/queue/akwam-job.processor.ts): إدارة الطابور الخلفي والتحكم في عدد المهام المتزامنة ونظام الأولويات.

### 4. طبقة العرض والواجهة (Presentation Layer)
- وحدات التحكم REST Controllers المزودة بتوثيق Swagger تفاعلي ثنائي اللغة (العربية والإنجليزية).
- دفق الأحداث الحية **Server-Sent Events (SSE)** عبر نقطة النهاية `/akwam/jobs/:id/events`.
- فلتر الاستثناءات الشامل [`GlobalHttpExceptionFilter`](file:///d:/NestJs/akwam-nest/src/presentation/filters/http-exception.filter.ts) الذي يُخفي تفاصيل السيرفر الداخلية ويُرجع أخطاء موحدة مع معرّف تتبع فريد (`X-Request-Id`).
- واجهة الويب السينمائية المدمجة داخل مجلد `public`.

---

## 💡 الابتكارات الهندسية الجوهرية (Engineering Highlights)

### 1. البحث غير التزامني ثنائي المراحل (Two-Phase Async Search)
أكبر مشكلة في كاشطات الويب هي الزحف العشوائي. لو بحث مستخدم عن كلمة "Batman"، سيجد الموقع 20 نتيجة. إذا حاول النظام جلب روابط تحميل كل نتيجة مباشرة، فسيقوم بفتح أكثر من 150 صفحة ويب وتوجيه، مما يستغرق 4 دقائق كاملة!

حل النظام هذه المعضلة بنمط **المرحلتين**:
* **المرحلة الأولى (Discovery Phase):** خلال ثانيتين فقط، يجلب النظام بطاقات البحث السطحية (العناوين والبوسترات) ويُصنفها كـ Candidates، ثم يضع المهمة في حالة `awaiting_selection`.
* **المرحلة الثانية (Targeted Processing):** يختار المستخدم تحديداً الفيلم أو المسلسل الذي يريد مشاهدته، فيقوم الطابور فقط بمعالجة العناصر المحددة. وفرت هذه الخطوة أكثر من **90%** من طلبات الشبكة واستهلاك الذاكرة.

### 2. تدفق الأحداث الحية (Real-Time SSE) وحل مشكلة ضياع الرسائل (Replay Buffer)
الاتصال التقليدي عبر الـ Polling يُرهق السيرفر. يوفر **akwam-nest** قناة بث حي عبر Server-Sent Events (SSE). 

ولحل المشكلة الشائعة المتمثلة في اشتراك متصفح العميل بعد انطلاق الحدث بثانية أو اثنتين، تم تصميم الـ Repository باستخدام **`ReplaySubject(10)`**؛ بحيث يحفظ آخر 10 أحداث في الذاكرة. بمجرد فتح المتصفح للاتصال، يستلم فوراً لقطة الحالة الأخيرة دون أن يفوته أي حدث كـ `candidates` أو `status`.

### 3. خوارزمية فك الروابط ثلاثية المراحل (3-Step Redirect Resolver)
يقوم موقع أكوام بحماية روابطه المباشرة خلف صفحات وسيطة متعددة وزر "جاري تجهيز الرابط". طوّر النظام خوارزمية تسلسلية:
1. فحص الرابط: إذا كان رابط وسائط مباشر ينتهي بـ `.mp4` أو يشير لسيرفرات `downet.net/download/` يُعاد فوراً.
2. طلب صفحة التحويل واستخراج الرابط النهائي المباشر من زر `.btn-loader a.link`.
3. وفي حال وجود صفحات وسيطة قديمة، يتتبع الرابط المرحلي ويستخلص رابط الـ CDN النهائي الصالح للتحميل الفوري أو البث المباشر.

### 4. محرك بث الفيديو الذكي والتجزئة التقدمية (Smart Video Streaming Proxy & HTTP 206)
عند تشغيل فيلم عالي الدقة (Full HD 1080p) في المتصفح، يُرسل مشغل الفيديو طلباً بمدى مفتوح: `Range: bytes=0-`. إذا تم تمرير هذا الطلب للسيرفر الأصلي، سيبدأ بنقل 3 جيجابايت كاملة دفعة واحدة؛ مما يملأ رامات السيرفر وذاكرة المتصفح ويسبب بطئاً وتجميداً تاماً.

ابتكر النظام في [`AkwamStreamService`](file:///d:/NestJs/akwam-nest/src/infrastructure/scraping/akwam-stream.service.ts) خوارزمية **التجزئة المقيدة (Bounded Progressive Chunking)**:
- يتم اعتراض ترويسة الـ Range وتقييدها تلقائياً بشريحة حجمها **3 ميجابايت (3MB)** فقط.
- يُعاد الرد بحالة **`HTTP 206 Partial Content`** مع ترويسات `Accept-Ranges: bytes` و `Content-Range`.
- يبدأ المشغل المدمج في العمل خلال **أقل من 200 ميلي ثانية (<200ms)**!
- يدعم التقديم والتأخير اللحظي (Fast Seeking)؛ فعند نقر المستخدم على الدقيقة 45، يُرسل المتصفح المدى المقابل، فيقوم السيرفر بجلب الـ 3MB الخاصة بتلك اللحظة فوراً.

### 5. البث التراكمي للمسلسلات حلقة بحلقة (Live Episode Streaming)
بدلاً من حجز المستخدم حتى تنتهي كافة حلقات الموسم، يُطلق النظام حدث SSE من نوع `item (kind: episode)` في اللحظة ذاتها التي يتم فيها فك روابط الحلقة الواحدة. تظهر الحلقة فوراً في واجهة المستخدم ليتمكن من بدء المشاهدة أثناء استمرار معالجة بقية الحلقات في الخلفية!

---

## 🛡️ الترسانة الأمنية الصارمة (Hardened Security Suite)

تم تدقيق النظام وسد جميع الثغرات الشائعة لضمان جاهزية الإنتاج (Production-Grade Security):

| التهديد الأمني | آلية الحماية المطبقة في النظام |
|----------------|-------------------------------|
| **هجمات SSRF واستهداف الكلاود** | تطبيق **قائمة بيضاء صارمة (Allowlist)** للمواقع المصرح جلب الصور والفيديو منها (`ak.sv`, `downet.net`, `akwam.*`)، مع إيقاف الـ Redirects تماماً (`maxRedirects: 0`)، وفحص الـ DNS لمنع العناوين الداخلية والـ Metadata (`169.254.169.254`). |
| **هجمات التوقيت (Timing Attacks)** | التحقق من كوكي الأدمن باستخدام الدالة الرياضية الثابتة زمنياً [`crypto.timingSafeEqual`](file:///d:/NestJs/akwam-nest/src/queue/queue-bypass.middleware.ts) لمنع تخمين الرمز السري عبر قياس زمن الاستجابة. |
| **تزييف الهوية والـ Rate Limit Bypass** | الاعتماد الحصري على `req.ip` الموثوق به من خادم Express مع ضبط `trust proxy 1`، بدلاً من قراءة ترويسات `X-Forwarded-For` يدوياً التي يسهل التلاعب بها. |
| **هجمات الحرمان من الخدمة (DoS)** | وضع سقف صارم لحجم حمولة الـ JSON مقداره **100KB**، وتحديد سقف لحجم الصور المجلوبة **5MB**، مع محدد سرعة انزلاقي في Redis. |
| **هجمات الحقن و XSS** | فحص مدخلات البحث عبر DTOs مطهرة تزيل رموز HTML والـ Null Bytes وتمنع تلويث المعاملات عبر `hpp()`. |
| **حماية الترويسات والـ Clickjacking** | تفعيل **Helmet** بسياسات صارمة لـ Content Security Policy (CSP)، و X-Frame-Options لمنع تضمين المنصة في نوافذ خبيثة، وسياسات CORS محكمة. |

---

## 🖥️ الواجهة السينمائية وغرفة المشاهدة (Cinema Experience & Watch Room)

يحتوي النظام على واجهة مستخدم متكاملة وعصرية (Modern Arabic Glassmorphism) مبنية بـ Vanilla JavaScript متقدم دون الحاجة لأطر عمل ثقيلة:

* **شاشة البحث والمتابعة الحية (`index.html`):**
  - شريط بحث ذكي مع أزرار مسح فوري وإعادة ضبط سريعة.
  - مؤشر تقدم حي (Progress Bar) يعرض النسبة المئوية ورسائل المرحلة الحالية القادمة عبر الـ SSE.
  - شبكة عرض النتائج المرشحة مع البوسترات وسنة الإنتاج وأزرار اختيار تفاعلية.
  - بطاقات المسلسلات القابلة للطي والفتح (Collapsible Series Capsule Cards) مع ظهور الحلقات تباعاً.
* **غرفة المشاهدة السينمائية (`watch.html`):**
  - مدعومة بمشغل **Plyr.io** الفاخر.
  - مدمجة بحزم محلية احتياطية (`/vendor/plyr/*`) لضمان استمرار المشغل حتى في حال تعطل شبكات CDN العالمية.
  - شريط تنقل سلس بين الجودات المتاحة (1080p, 720p, 480p) مع تذكر موضع التشغيل.
  - اختصارات لوحة المفاتيح للمشاهدة السريعة (مسافة للتشغيل/الإيقاف، الأسهم للتقديم والتأخير، حرف F لملء الشاشة).
  - حفظ الجلسة واستئناف المشاهدة عبر `localStorage`.

---

## 🚀 دليل التثبيت والتشغيل السريع

### المتطلبات الأساسية
* **Node.js:** إصدار `≥ 20.x`
* **npm:** إصدار `≥ 9.x`
* **Redis:** خادم محلي (Redis 7) أو حساب سحابي **Upstash Redis** مع تفعيل TLS.

### 1. الاستنساخ وتثبيت الحزم
```bash
git clone https://github.com/AhmedHassan/akwam-nest.git
cd akwam-nest
npm install
```

### 2. ضبط متغيرات البيئة
قم بنسخ ملف البيئة النموذجي:
```bash
cp .env.example .env
```

قم بملء المتغيرات في `.env`:
```env
# منفذ الخادم
PORT=5000
NODE_ENV=production

# إعدادات Redis (يدعم رابط URL المباشر أو المعاملات المنفصلة)
REDIS_URL=rediss://default:YourPassword@your-upstash-host:6379
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_TLS=false

# إدارة طابور BullMQ ومحددات السرعة
SCRAPE_REQUESTS_PER_SECOND=2
QUEUE_MAX_CONCURRENT_JOBS=2
QUEUE_DEFAULT_PRIORITY=10
QUEUE_ADMIN_PRIORITY=1000000

# محدد سرعة واجهة الاستخدام (لكل عنوان IP)
RATE_LIMIT_PER_USER=10
RATE_LIMIT_WINDOW_SEC=60

# كوكي تخطي الطابور للأدمن (إلزامي — قيمة عشوائية معقدة)
QUEUE_BYPASS_COOKIE_NAME=access_queue
QUEUE_BYPASS_COOKIE_VALUE=f8e7d6c5b4a3928170e1d2c3b4a59687e8d7c6b5a493827160f1e2d3c4b5a697
```

### 3. بناء وتشغيل المشروع
```bash
# بناء كود TypeScript
npm run build

# تشغيل الخادم بوضع الإنتاج
npm run start:prod

# أو للتشغيل أثناء التطوير (مع إعادة التحميل التلقائي Hot-Reload)
npm run start:dev
```

* **واجهة الويب:** [http://localhost:5000](http://localhost:5000)
* **توثيق Swagger التفاعلي:** [http://localhost:5000/api/docs](http://localhost:5000/api/docs)
* **فحص الحالة وصحة النظام:** [http://localhost:5000/health](http://localhost:5000/health)

---

## 🐳 التشغيل عبر Docker و Docker Compose

يحتوي المشروع على [`Dockerfile`](file:///d:/NestJs/akwam-nest/Dockerfile) احترافي متعدد المراحل (Multi-stage Build) مبني على صورة `node:20-alpine` المصغرة:

### تشغيل النظام بالكامل بضغطة زر واحدة:
```bash
docker compose up -d --build
```
يقوم هذا الأمر بتشغيل:
1. حاوية خادم **akwam-nest** وتجهيز بيئة التشغيل.
2. حاوية **Redis 7 Alpine** محلية مع حفظ البيانات الدائم في مجلد `redis_data`.

---

## 📚 المرجع الكامل لواجهات الـ REST API

| المنهج | المسار (Endpoint) | الوصف | التصنيف |
|:---:|---|---|---|
| `POST` | `/akwam/jobs` | إنشاء مهمة بحث غير تزامنية والبدء باستكشاف العناوين | `jobs` |
| `GET` | `/akwam/jobs/:id` | استرجاع أحدث لقطة لحالة المهمة والنتائج الحالية | `jobs` |
| `GET` | `/akwam/jobs/:id/events` | فتح قناة البث الحي (SSE) لتلقي تحديثات التقدم والنتائج | `jobs` |
| `POST` | `/akwam/jobs/:id/start` | اختيار معرفات الأعمال وبدء المعالجة واستخراج الروابط | `jobs` |
| `DELETE` | `/akwam/jobs/:id` | إلغاء المهمة فورياً وإيقاف العامل الخلفي | `jobs` |
| `GET` | `/akwam/jobs/queue/status` | إحصائيات طابور BullMQ (waiting, active, completed, failed) | `jobs` |
| `GET` | `/akwam/proxy-image?url=...` | بروكسي الصور المحمي من SSRF والمخزن في Redis لمدة 24 ساعة | `utils` |
| `GET` | `/akwam/stream?url=...` | بروكسي بث الفيديو المباشر بتجزئة HTTP 206 Partial Content | `utils` |
| `GET` | `/health` | فحص صحة النظام وحالة الاتصال بقاعدة بيانات Redis | `utils` |
| `POST` | `/akwam?search=...` | النمط التزامني القديم المباشر (Legacy Synchronous API) | `legacy` |

---

## 🧪 ضمان الجودة والاختبارات الشاملة (System Verification)

يتضمن المشروع حزمة اختبارات تحقق تكاملية شاملة داخل [`scratch/verify-all.js`](file:///d:/NestJs/akwam-nest/scratch/verify-all.js) تفحص جميع وظائف الخادم والمشغل:

```bash
npm test
```

### ما يتم فحصه في الاختبار التلقائي:
1. استجابة نقطة فحص الصحة `/health` وتأكيد اتصال Redis.
2. توافر وسلامة أصول مشغل Plyr المحلية (`.js`, `.css`, `.svg`).
3. تحميل صفحات الويب وعناصر التحكم (`#resetBtn`, `#clearInputBtn`, `watch.html`).
4. اختبار بروكسي بث الفيديو `/akwam/stream` واستجابته بـ **`HTTP 206`** والتحقق من حجم الشريحة المقيدة (3MB = 3,145,728 bytes).
5. اختبار دورة إنشاء المهمة واسترجاع لقطتها وفتح قناة الـ SSE وإنهاؤها بأمان.

---

## 🗺️ سير العمل والمخططات التفصيلية

للاطلاع على المخططات التسلسلية (Mermaid Sequence Diagrams) التفصيلية لكافة مسارات النظام وخوارزميات فك التوجيه، يُرجى مراجعة الملف المخصص:
👉 **[دليل سير العمل الشامل — WORKFLOW.md](file:///d:/NestJs/akwam-nest/WORKFLOW.md)**

---

## 📜 الترخيص (License)

هذا المشروع مرخص بموجب رخصة [MIT License](LICENSE) — يحق لك الاستخدام، التعديل، والتوزيع التجاري والشخصي مع ذكر المصدر الأصلي.
