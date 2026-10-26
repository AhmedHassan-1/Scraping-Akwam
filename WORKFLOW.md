# 🔄 دليل ومخططات سير العمل الشاملة للنظام (Akwam System Workflows & Architecture Lifecycle)

> وثيقة هندسية تفصيلية تستعرض دورة حياة الطلبات، تدفق البيانات عبر طبقات المعمارية النظيفة (Clean Architecture)، خوارزميات فك التوجيه، استراتيجية التجزئة اللحظية لبث الفيديو، وإدارة الطوابير والأحداث المباشرة في منصة **akwam-nest**.

---

## 📑 فهرس المحتويات

1. [نظرة عامة على سير العمليات ومكونات النظام](#1-نظرة-عامة-على-سير-العمليات-ومكونات-النظام)
2. [المخطط الهيكلي العام للتدفق (Master Architecture Flow)](#2-المخطط-الهيكلي-العام-للتدفق-master-architecture-flow)
3. [دورة حياة المهمة غير التزامنية (Async Job Lifecycle)](#3-دورة-حياة-المهمة-غير-التزامنية-async-job-lifecycle)
4. [مرحلة الاستكشاف واختيار العناصر (Phase 1: Discovery & Candidate Selection)](#4-مرحلة-الاستكشاف-واختيار-العناصر-phase-1-discovery--candidate-selection)
5. [مرحلة المعالجة العميقة وحل الروابط (Phase 2: Deep Scraping & Link Resolution)](#5-مرحلة-المعالجة-العميقة-وحل-الروابط-phase-2-deep-scraping--link-resolution)
6. [خوارزمية فك الروابط المباشرة ثلاثية المراحل (3-Step Redirect Resolver)](#6-خوارزمية-فك-الروابط-المباشرة-ثلاثية-المراحل-3-step-redirect-resolver)
7. [مسار معالجة المسلسلات والبث اللحظي حلقة بحلقة (Series & Episodes Live Stream)](#7-مسار-معالجة-المسلسلات-والبث-اللحظي-حلقة-بحلقة-series--episodes-live-stream)
8. [سير عمل بروكسي بث الفيديو والتجزئة الذكية (Video Streaming Proxy & Bounded 206 Ranges)](#8-سير-عمل-بروكسي-بث-الفيديو-والتجزئة-الذكية-video-streaming-proxy--bounded-206-ranges)
9. [سير عمل بروكسي الصور والحماية من SSRF (Image Proxy & SSRF Defense)](#9-سير-عمل-بروكسي-الصور-والحماية-من-ssrf-image-proxy--ssrf-defense)
10. [سير عمل تخطي الطابور ومحدد السرعة (Rate Limiting & Admin Bypass)](#10-سير-عمل-تخطي-الطابور-ومحدد-السرعة-rate-limiting--admin-bypass)
11. [آلة حالات المهمة وإدارة الإلغاء والأخطاء (Job State Machine & Failure Recovery)](#11-آلة-حالات-المهمة-وإدارة-الإلغاء-والأخطاء-job-state-machine--failure-recovery)
12. [تدفق البيانات بين طبقات المعمارية (Data Flow Across Clean Layers)](#12-تدفق-البيانات-بين-طبقات-المعمارية-data-flow-across-clean-layers)

---

## 1. نظرة عامة على سير العمليات ومكونات النظام

يعتمد نظام **akwam-nest** على نمط **المعالجة غير التزامنية المرحلية (Two-Phase Async Pipeline)** المدعوم بطابور مهام **BullMQ** وقاعدة بيانات **Upstash Redis (TLS)**، لضمان عدم حجب موارد الخادم (Non-blocking I/O) وتوفير تجربة مستخدم سلسة حتى أثناء معالجة مسلسلات ضخمة تضم عشرات الحلقات.

### المكونات الفاعلة في سير العمل (System Actors):
* **العميل (Client Application):** المتصفح أو تطبيق الهاتف أو واجهة Swagger التي تبدأ الطلب وتستمع للأحداث الحية عبر Server-Sent Events (SSE).
* **طبقة الواجهة والتحكم (Presentation Layer):** تستقبل الطلبات، وتطبق محدد السرعة (Rate Limiting)، وتتحقق من كوكي الأدمن، وتفحص المدخلات عبر الـ DTOs و ValidationPipe.
* **طبقة حالات الاستخدام (Application Use Cases):** تنسق منطق الأعمال المستقل عن البنية التحتية.
* **طابور المهام (BullMQ Worker & Redis Queue):** يدير أولويات المهام، وتوزيع المعالجة، والتحكم في التزامن (Concurrency).
* **مستودع الحالة والأحداث (Redis Job Repository):** يخزن لقطة حالة المهمة (Snapshot) مع TTL تلقائي (ساعتان)، ويدير قنوات البث (Pub/Sub) ومخزن الذاكرة التراكمي `ReplaySubject(10)`.
* **محرك التجريف والتحليل (Infrastructure Scraping Engine):** يضم عميل HTTP ذو الاتصال المستمر (Keep-Alive)، ومحللات Cheerio المعزولة، ومفكك الروابط ثلاثي المراحل.
* **بروكسي الفيديو (Streaming Service):** يتولى جلب وتجزئة تدفق الفيديو بطلب أجزاء محددة (Byte-Ranges) وتمريرها للمشغل عبر HTTP 206.

---

## 2. المخطط الهيكلي العام للتدفق (Master Architecture Flow)

يوضح المخطط التالي المسار الإجمالي الذي يسلكه أي استعلام داخل المنظومة:

```mermaid
flowchart TD
    Client["العميل ( المتصفح أو التطبيق )"] -->|1. إنشاء مهمة بحث| JobsCtrl["AkwamJobsController"]
    JobsCtrl -->|فحص الأمان والـ Rate Limit| Guard["UserRateLimitGuard"]
    Guard -->|تمرير الطلب| CreateJobUC["CreateJobUseCase"]
    CreateJobUC -->|حفظ المهمة بحالة queued| RedisRepo["RedisJobRepository"]
    CreateJobUC -->|إدراج في طابور BullMQ| BullQueue["BullMqQueueService"]
    
    Client -->|2. اشتراك فوري في SSE| JobsCtrl
    JobsCtrl -->|فتح دفق الأحداث| RedisRepo
    
    BullQueue -->|سحب المهمة حسب الأولوية| Worker["AkwamJobProcessor"]
    Worker -->|3. مرحلة الاستكشاف| SearchSvc["AkwamSearchService"]
    SearchSvc -->|جلب صفحة البحث| AkwamHTTP["AkwamHttpClient"]
    AkwamHTTP -->|طلب HTTP مقنن| TargetSite["موقع أكوام ak.sv"]
    
    SearchSvc -->|تحليل النتائج المرشحة| ParserSearch["SearchPageParser"]
    ParserSearch -->|قائمة المرشحين| Worker
    Worker -->|حفظ المرشحين وإرسال حدث candidates| RedisRepo
    RedisRepo -->|بث فوري عبر SSE| Client
    
    Client -->|4. اختيار عناصر محددة وبدء المعالجة| JobsCtrl
    JobsCtrl -->|إدراج مهمة المعالجة في الطابور| BullQueue
    BullQueue -->|سحب مهمة المعالجة| Worker
    
    Worker -->|5. استخراج البيانات والروابط| MediaSvc["AkwamMediaService"]
    MediaSvc -->|فك روابط التوجيه ثلاثية المراحل| Resolver["AkwamDownloadResolverService"]
    Resolver -->|استخراج روابط CDN النهائية| DownetCDN["سيرفرات التوزيع downet.net"]
    
    MediaSvc -->|بث الحلقات والأفلام أولا بأول| Worker
    Worker -->|حفظ النتائج وإرسال حدث item و complete| RedisRepo
    RedisRepo -->|تحديث العرض الحي لدى العميل| Client
    
    Client -->|6. طلب تشغيل الفيديو| StreamCtrl["AkwamProxyController"]
    StreamCtrl -->|تجزئة التدفق بـ 3MB Chunks| StreamSvc["AkwamStreamService"]
    StreamSvc -->|بث HTTP 206 Partial Content| DownetCDN
```

---

## 3. دورة حياة المهمة غير التزامنية (Async Job Lifecycle)

تتألف دورة حياة المهمة من مرحلتين منفصلتين ومحطات تحقق دقيقة لتفادي استنزاف موارد السيرفر:

```mermaid
sequenceDiagram
    autonumber
    actor User as العميل (Client)
    participant API as AkwamJobsController
    participant Repo as RedisJobRepository
    participant Queue as BullMQ Queue
    participant Worker as AkwamJobProcessor
    participant Scraper as AkwamScraperFacade

    User->>API: POST /akwam/jobs (search: "Batman")
    API->>Repo: إنشاء سجل المهمة (Status: queued)
    API->>Queue: إضافة مهمة discovery للطابور
    API-->>User: 201 Created (jobId: UUID, status: queued)

    User->>API: GET /akwam/jobs/:id/events (SSE)
    API->>Repo: الاشتراك في دفق الأحداث (ReplaySubject)
    Repo-->>User: إرسال حدث snapshot و queue position

    Queue->>Worker: بدء معالجة مهمة discovery
    Worker->>Repo: تحديث الحالة إلى discovering
    Repo-->>User: SSE Event: status: "discovering"

    Worker->>Scraper: discoverCandidates("Batman")
    Scraper-->>Worker: استرجاع مصفوفة المرشحين (SearchCandidates)
    Worker->>Repo: حفظ المرشحين (Status: awaiting_selection)
    Repo-->>User: SSE Event: candidates: [...]
    Repo-->>User: SSE Event: status: "awaiting_selection"

    Note over User, API: يراجع المستخدم النتائج والبوسترات ويحدد ما يريد

    User->>API: POST /akwam/jobs/:id/start (selectedIds: [0, 2])
    API->>Repo: التحقق من وجود المعرفات
    API->>Queue: إضافة مهمة process للطابور
    API-->>User: 200 OK (status: processing)

    Queue->>Worker: معالجة مهمة process
    Worker->>Repo: تحديث الحالة إلى processing
    Repo-->>User: SSE Event: status: "processing"

    loop لكل عمل أو حلقة تم فك روابطها
        Worker->>Scraper: استخراج بيانات العمل وروابط التحميل
        Scraper-->>Worker: اكتمال فيلم أو حلقة
        Worker->>Repo: حفظ التقدم الجزئي
        Repo-->>User: SSE Event: item (بيانات العمل مكتملة)
    end

    Worker->>Repo: اكتمال المهمة (Status: completed)
    Repo-->>User: SSE Event: complete (كافة النتائج)
    Repo-->>User: SSE Event: status: "completed"
```

---

## 4. مرحلة الاستكشاف واختيار العناصر (Phase 1: Discovery & Candidate Selection)

تعتبر هذه المرحلة صمام الأمان للنظام؛ بدلاً من الزحف العشوائي وتحميل جميع روابط نتائج البحث، يتم فقط سحب العناوين والصور لتوفير 95% من وقت المعالجة واستهلاك الشبكة.

```mermaid
flowchart LR
    Start(["بدء البحث"]) --> ReqSearch["طلب صفحة البحث: ak.sv/search?q=..."]
    ReqSearch --> RateCheck{"فحص محدد السرعة (Token Bucket)"}
    RateCheck -->|مسموح| FetchHTML["جلب كود HTML عبر Axios Keep-Alive"]
    RateCheck -->|مكتظ| DelayQueue["انتظار توفر Token في الخزان"]
    DelayQueue --> FetchHTML
    
    FetchHTML --> CheerioLoad["تحميل الصفحة في Cheerio"]
    CheerioLoad --> QueryCards["استخراج كروت النتائج (.entry-box)"]
    
    QueryCards --> ExtractData["استخراج: العنوان + الرابط + البوستر"]
    ExtractData --> ImageFallback{"هل البوستر مباشر أم Lazy؟"}
    ImageFallback -->|data-src| TakeDataSrc["اعتماد data-src"]
    ImageFallback -->|srcset| TakeSrcset["استخراج أعلى دقة من srcset"]
    ImageFallback -->|src| TakeSrc["اعتماد src"]
    
    TakeDataSrc --> BuildCandidate["بناء كائن SearchCandidate"]
    TakeSrcset --> BuildCandidate
    TakeSrc --> BuildCandidate
    
    BuildCandidate --> CheckCount{"هل توجد نتائج؟"}
    CheckCount -->|نعم| SetAwaiting["الحالة: awaiting_selection"]
    CheckCount -->|لا| SetCompletedEmpty["الحالة: completed (نتائج فارغة)"]
    
    SetAwaiting --> PublishSSE["بث مصفوفة المرشحين للمستخدم"]
    SetCompletedEmpty --> PublishSSE
```

---

## 5. مرحلة المعالجة العميقة وحل الروابط (Phase 2: Deep Scraping & Link Resolution)

عندما يختار العميل المعرفات المطلوبة (مثلاً: الفيلم رقم 0 والحلقة رقم 3)، تنطلق المعالجة العميقة:

```mermaid
flowchart TD
    SelectNode["استلام selectedIds من العميل"] --> ValidateIds{"التحقق من صحة المعرفات"}
    ValidateIds -->|غير صالحة| Throw400["إرجاع خطأ 400 Bad Request"]
    ValidateIds -->|صالحة| FetchDetails["جلب صفحة تفاصيل العمل"]
    
    FetchDetails --> TypeCheck{"هل المحتوى فيلم أم مسلسل؟"}
    
    TypeCheck -->|فيلم (Movie)| ParseMovie["تحليل تفاصيل الفيلم والجودات"]
    ParseMovie --> ResolveMovie["فك روابط تحميل الجودات تتابعياً"]
    ResolveMovie --> SaveMovie["تحديث سجل الفيلم وبث حدث item"]
    
    TypeCheck -->|مسلسل (Series)| ParseSeries["تحليل تفاصيل المسلسل وروابط الحلقات"]
    ParseSeries --> LoopEpisodes["حلقة تكرارية على صفحات الحلقات"]
    LoopEpisodes --> ParseEp["جلب صفحة الحلقة واستخراج الجودات"]
    ParseEp --> ResolveEp["فك روابط تحميل الحلقة تتابعياً"]
    ResolveEp --> EmitEp["بث حدث لحظي للحلقة المكتملة (Live Episode Stream)"]
    EmitEp --> NextEp{"هل بقيت حلقات أخرى؟"}
    NextEp -->|نعم| LoopEpisodes
    NextEp -->|لا| CompleteSeries["تحديث كائن المسلسل كاملاً وبث حدث item"]
    
    SaveMovie --> CheckAllDone{"هل اكتملت كل العناصر المختارة؟"}
    CompleteSeries --> CheckAllDone
    
    CheckAllDone -->|نعم| MarkDone["حالة المهمة: completed وبث حدث complete"]
```

---

## 6. خوارزمية فك الروابط المباشرة ثلاثية المراحل (3-Step Redirect Resolver)

يقوم موقع أكوام بحماية روابط التحميل المباشرة وإخفائها خلف روابط تحويل متعددة وصفحات وسيطة لحماية سيرفرات CDN. يتولى `AkwamDownloadResolverService` حل هذه التعقيدات آلياً:

```mermaid
sequenceDiagram
    autonumber
    participant Engine as AkwamDownloadResolverService
    participant Parser as DownloadLinksParser
    participant HTTP as AkwamHttpClient
    participant Akwam as موقع أكوام (ak.sv)
    participant Downet as خوادم التحميل (downet.net)

    Note over Engine: الرابط الأولي: https://ak.sv/download/7057/562/inception-1
    
    Engine->>Engine: فحص الرابط: هل هو رابط مباشر مسبقاً؟
    alt رابط مباشر ينتهي بـ .mp4 أو يحتوي downet.net/download/
        Engine-->>Engine: إرجاع الرابط مباشرة بدون أي طلبات شبكية
    else رابط تحويل
        Engine->>HTTP: GET الرابط الأولي (صفحة التوجيه)
        HTTP->>Akwam: جلب HTML صفحة التحميل
        Akwam-->>HTTP: محتوى الصفحة (Buffer)
        
        Engine->>Parser: parseFinalDirectUrlFromRedirectPage()
        alt الرابط المباشر موجود فوراً في زر .btn-loader a.link
            Parser-->>Engine: الرابط المباشر (https://s301d3.downet.net/download/...)
        else وجود صفحة وسيطة سابقة (Legacy Intermediate Redirect)
            Parser-->>Engine: رابط الصفحة الوسيطة
            Engine->>HTTP: GET رابط الصفحة الوسيطة
            HTTP->>Akwam: جلب كود الصفحة الوسيطة
            Akwam-->>HTTP: محتوى الصفحة الثانية
            Engine->>Parser: استخراج الرابط المباشر النهائي
            Parser-->>Engine: رابط التوزيع المباشر (Downet MP4 CDN)
        end
    end

    Note over Engine: النتيجة: رابط مباشر صالح للتحميل الفوري أو البث المباشر
```

---

## 7. مسار معالجة المسلسلات والبث اللحظي حلقة بحلقة (Series & Episodes Live Stream)

أحد أبرز الابتكارات في النظام هو **عدم إجبار المستخدم على انتظار معالجة المسلسل بالكامل** (الذي قد يستغرق دقيقة أو دقيقتين للمسلسلات الطويلة)، بل يتم بث كل حلقة للمتصفح لحظة فك روابطها:

```mermaid
flowchart TD
    SeriesStart["بدء معالجة المسلسل"] --> FetchSeriesPage["جلب صفحة المسلسل الرئيسية"]
    FetchSeriesPage --> ExtractMeta["استخراج البوستر، التقييم، التصنيفات، وسنة الإنتاج"]
    ExtractMeta --> ExtractEps["استخراج قائمة روابط الحلقات (مثلاً 30 حلقة)"]
    
    ExtractEps --> InitSeriesObj["إنشاء كائن Series بدون حلقات بعد"]
    InitSeriesObj --> EpLoop["معالجة الحلقة i"]
    
    EpLoop --> FetchEpPage["جلب كود HTML لصفحة الحلقة"]
    FetchEpPage --> ParseEpQualities["استخراج الجودات المتاحة (1080p, 720p, 480p)"]
    ParseEpQualities --> ResolveQualities["فك الروابط المباشرة لكل جودة تتابعياً"]
    
    ResolveQualities --> BuildEpObj["تكوين كائن Episode مكتمل بروابطه"]
    BuildEpObj --> AppendToSeries["إضافة الحلقة لكائن المسلسل"]
    
    AppendToSeries --> PushLiveEvent["إرسال حدث SSE مباشر: kind = episode"]
    PushLiveEvent --> ClientDOM["المتصفح يضيف زر الحلقة فوراً في بطاقة المسلسل"]
    
    ClientDOM --> MoreEps{"هل هناك حلقة تالية؟"}
    MoreEps -->|نعم| EpLoop
    MoreEps -->|لا| FinalSeriesEvent["إرسال حدث SSE ختامي: kind = series مكتمل"]
```

---

## 8. سير عمل بروكسي بث الفيديو والتجزئة الذكية (Video Streaming Proxy & Bounded 206 Ranges)

عند تشغيل الفيديو داخل مشغل `Plyr.io`، ترسل المتصفحات ترويسة Range مفتوحة (`bytes=0-` أو `bytes=3145728-`). إذا تم تمرير هذا الطلب كما هو لمصدر الفيديو، سيقوم بتحميل الملف كاملاً (قد يصل لـ 4 جيجابايت) مما يستهلك رامات السيرفر وذاكرة المتصفح ويسبب بطئاً وتجميداً.

يقوم `AkwamStreamService` بتطبيق **خوارزمية التجزئة التقدمية (Bounded Progressive Chunking)**:

```mermaid
sequenceDiagram
    autonumber
    actor Player as مشغل الفيديو (Plyr.io / المتصفح)
    participant Proxy as AkwamProxyController
    participant StreamSvc as AkwamStreamService
    participant CDN as سيرفر الفيديو الأصلي (Downet CDN)

    Player->>Proxy: GET /akwam/stream?url=... (Range: "bytes=0-")
    Proxy->>StreamSvc: validateUrl(url)
    
    Note over StreamSvc: فحص الأمان: التأكد من تطابق الدومين مع القائمة البيضاء (downet.net, akwam, ak.sv)
    
    Proxy->>StreamSvc: resolveBoundedRange("bytes=0-", chunkParam)
    
    Note over StreamSvc: تحويل المدى المفتوح إلى شريحة محكمة:<br/>bytes=0-3145727 (حجم 3MB بالضبط)

    Proxy->>CDN: GET الرابط المباشر مع ترويسة Range المقيدة (3MB)
    CDN-->>Proxy: 206 Partial Content (3MB Chunk)
    
    Note over Proxy: إعداد الترويسات الصارمة:<br/>Content-Type: video/mp4<br/>Content-Disposition: inline<br/>Accept-Ranges: bytes<br/>Content-Range: bytes 0-3145727/TotalSize

    Proxy-->>Player: 206 Partial Content (أول 3MB فقط)
    Note over Player: يبدأ المشغل فورا خلال أقل من 200ms!

    Player->>Proxy: طلب المدى التالي عند اقتراب انتهاء التخزين (Range: "bytes=3145728-")
    Proxy->>StreamSvc: تحجيم المدى مجددا (3MB إضافية)
    Proxy->>CDN: طلب الشريحة التالية (3MB)
    CDN-->>Proxy: 206 Partial Content
    Proxy-->>Player: 206 Partial Content
```

---

## 9. سير عمل بروكسي الصور والحماية من SSRF (Image Proxy & SSRF Defense)

لمنع مشاكل حظر الـ Hotlinking و CORS، ولحماية السيرفر من هجمات اختراق الشبكات الداخلية (SSRF)، يسلك طلب الصور المسار التالي:

```mermaid
flowchart TD
    ReqImg["طلب صورة: GET /akwam/proxy-image?url=..."] --> CheckRate["محدد سرعة مخصص للصور (150 طلب/دقيقة)"]
    CheckRate -->|تجاوز الحد| Err429["429 Too Many Requests"]
    CheckRate -->|مسموح| ValidateUrl["فحص الرابط أمنياً"]
    
    ValidateUrl --> CheckProtocol{"البروتوكول HTTPS فقط؟"}
    CheckProtocol -->|لا| Err400Proto["400 Bad Request: بروتوكول مرفوض"]
    CheckProtocol -->|نعم| CheckDomain{"الدومين ضمن القائمة البيضاء المصرحة؟"}
    
    CheckDomain -->|لا| Err400Host["400 Bad Request: دومين غير مصرح"]
    CheckDomain -->|نعم| CheckDNS{"فحص DNS: هل يشير لـ Private IP أو Metadata؟"}
    
    CheckDNS -->|نعم: 127.0.0.1, 10.x, 169.254.x| Err400SSRF["400 Bad Request: محاولة SSRF محظورة"]
    CheckDNS -->|لا: IP عام نظيف| CheckCache{"فحص كاش الصور في Redis"}
    
    CheckCache -->|موجود في الكاش| ReturnCached["إرجاع البايتات المخزنة مباشرة مع Content-Type"]
    CheckCache -->|غير موجود| FetchUpstream["طلب الصورة من السيرفر المصدر"]
    
    FetchUpstream --> SecurityOpts["خيارات: maxRedirects: 0، maxContentLength: 5MB"]
    SecurityOpts --> CheckContentType{"هل ترويسة Content-Type صورة فعلية؟"}
    
    CheckContentType -->|لا (HTML / Executable)| Err400Mime["400 Bad Request: المحتوى ليس صورة"]
    CheckContentType -->|نعم (image/jpeg, png, webp)| StoreRedis["حفظ في Redis مع TTL = 24 ساعة"]
    
    StoreRedis --> SendResponse["إرسال بايتات الصورة مع Cache-Control: max-age=86400"]
    ReturnCached --> SendResponse
```

---

## 10. سير عمل تخطي الطابور ومحدد السرعة (Rate Limiting & Admin Bypass)

يتضمن النظام خط دفاع مزدوج لحماية الموارد مع إمكانية منح مسؤولي النظام أولوية فائقة وتجاوز الحدود:

```mermaid
flowchart TD
    IncomingReq["طلب وارد للسيرفر"] --> ReadCookie["فحص كوكي access_queue"]
    
    ReadCookie --> HasCookie{"هل الكوكي موجود؟"}
    HasCookie -->|نعم| TimingCheck["مقارنة القيمة باستخدام crypto.timingSafeEqual"]
    HasCookie -->|لا| SetBypassFalse["req.queueBypass = false"]
    
    TimingCheck --> Match{"هل القيمة تطابق QUEUE_BYPASS_COOKIE_VALUE؟"}
    Match -->|نعم| SetBypassTrue["req.queueBypass = true"]
    Match -->|لا| SetBypassFalse
    
    SetBypassTrue --> PassGuard["تجاوز فحص Rate Limit"]
    PassGuard --> SetPriorityHigh["تعيين أولوية المهمة في BullMQ = 1,000,000"]
    
    SetBypassFalse --> ExecRateLimit["تطبيق UserRateLimitGuard"]
    ExecRateLimit --> ExtractIP["استخراج IP الموثوق (req.ip) مع trust proxy 1"]
    ExtractIP --> RedisSlidingWindow["حساب عدد الطلبات في النافذة المنزلقة (Redis)"]
    
    RedisSlidingWindow --> LimitExceeded{"تجاوز الحد (10 طلبات/دقيقة)؟"}
    LimitExceeded -->|نعم| Reject429["رفض الطلب: 429 Too Many Requests"]
    LimitExceeded -->|لا| AllowReq["السماح بالطلب وتعيين الأولوية العادية = 10"]
```

---

## 11. آلة حالات المهمة وإدارة الإلغاء والأخطاء (Job State Machine & Failure Recovery)

تتبع المهمة آلة حالات صارمة (Finite State Machine) تضمن عدم حدوث تضارب، مع إمكانية إلغاء المهمة في أي لحظة:

```mermaid
stateDiagram-v2
    [*] --> queued: إنشاء المهمة (POST /akwam/jobs)
    
    queued --> discovering: استلام الـ Worker لمهمة الاستكشاف
    queued --> cancelled: إلغاء العميل للمهمة (DELETE)
    
    discovering --> awaiting_selection: العثور على مرشحين (>= 1)
    discovering --> completed: لا توجد نتائج مطابقة (0 candidates)
    discovering --> failed: خطأ شبكي أو حظر من الموقع
    discovering --> cancelled: إلغاء من قبل المستخدم
    
    awaiting_selection --> processing: اختيار العناصر (POST /akwam/jobs/:id/start)
    awaiting_selection --> cancelled: إلغاء من قبل المستخدم
    
    processing --> completed: انتهاء معالجة كافة العناصر وفك روابطها
    processing --> failed: انقطاع الاتصال أو فشل فك الروابط
    processing --> cancelled: إلغاء المهمة أثناء المعالجة
    
    completed --> [*]: مسح تلقائي من Redis بعد ساعتين (TTL)
    failed --> [*]: مسح تلقائي من Redis بعد ساعتين (TTL)
    cancelled --> [*]: مسح فوري أو مع انتهاء الـ TTL
```

---

## 12. تدفق البيانات بين طبقات المعمارية (Data Flow Across Clean Layers)

تطبيقاً صارماً لمبادئ المعمارية النظيفة (Clean Architecture)، تسير البيانات في اتجاه أحادي من الخارج إلى الداخل مع التزام قاعدة التبعية (Dependency Rule):

```mermaid
flowchart RL
    subgraph Presentation["4. Presentation Layer (طبقة العرض والتحكم)"]
        Controllers["Controllers (AkwamJobs, AkwamProxy, Health)"]
        Middlewares["Middlewares & Guards (RateLimit, TimingSafe Cookie)"]
        Filters["GlobalHttpExceptionFilter"]
    end

    subgraph Application["2. Application Layer (طبقة حالات الاستخدام)"]
        UseCases["Use Cases (CreateJob, StartProcessing, ProxyImage, ...)"]
        DTOs["DTOs مع الـ Validation والـ Sanitization"]
    end

    subgraph CoreDomain["1. Core Domain Layer (نواة الأعمال الصافية)"]
        Entities["Entities (Movie, Series, Episode, Job, DownloadQuality)"]
        Contracts["Interfaces & Ports (IScraperService, IJobRepository, ...)"]
        DomainExceptions["Domain Exceptions (JobNotFound, ScrapingException)"]
    end

    subgraph Infrastructure["3. Infrastructure Layer (البنية التحتية والمحولات)"]
        Scraping["Specialized Scraping Services (Search, Media, Resolver, Stream)"]
        BullMQWorker["BullMQ Queue Service & Background Processor"]
        Persistence["Redis Job Repository & Redis Image Cache"]
        HttpClient["AkwamHttpClient (Axios Keep-Alive)"]
    end

    Controllers -->|تستدعي| UseCases
    UseCases -->|تعتمد على كائنات| Entities
    UseCases -->|تستخدم عقود| Contracts
    
    Infrastructure -.->|تنفذ عقود Interfaces| Contracts
    Infrastructure -->|تنشئ وتحدث| Entities
```

---

> **خلاصة:**
> هذا السير الممنهج يضمن أن النظام لا يتعطل حتى مع ذروة الاستخدام، ويحفظ ذاكرة الخادم من التسريب (Zero Memory Leak) بفضل التخزين المؤقت في Redis بـ TTL، كما يضمن استجابة فورية لمشغل الفيديو وأماناً عالي المستوى ضد شتى التهديدات السيبرانية.
