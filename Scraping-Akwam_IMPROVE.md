<div dir="rtl">

# 🛠️ IMPROVE — Scraping-Akwam (NestJS)

> المراجعة دي قراءة كود (Static Review) من غير ما أشغّل المشروع. الترتيب حسب الأهمية: 🔴 لازم النهارده · 🟠 قريب · 🟡 تحسين.

## 🔴 1) باسورد الأدمن مكتوب في الكود (أخطر حاجة)

القيمة `AhmedAdmin01557161078` مكتوبة كـ default في ملفين:
`src/config/configuration.ts` و `src/queue/queue-bypass.middleware.ts`.
الريبو Public، يعني أي حد يكتب الكوكي `access_queue=<القيمة>` يتخطى الطابور والـ Rate Limit. وكمان شكلها فيها رقم تليفون.

**الحل:**
1. غيّر القيمة فوراً في السيرفر (اعتبرها اتسربت، حتى لو مسحتها من الكود، هي موجودة في تاريخ git).
2. شيل الـ default خالص واعمل fail عند بداية التشغيل:

```ts
// configuration.ts
bypassCookieValue: process.env.QUEUE_BYPASS_COOKIE_VALUE,

// main.ts (قبل listen)
if (!config.get('queue.bypassCookieValue')) {
  throw new Error('QUEUE_BYPASS_COOKIE_VALUE is required');
}
```
3. قارن بـ `crypto.timingSafeEqual` بدل `===`، واستخدم قيمة عشوائية طويلة: `openssl rand -hex 32`.

## 🔴 2) ثغرة SSRF في `/akwam/proxy-image`

`isAllowedProxyUrl` بتمنع بس `localhost` و `127.0.0.1` و `192.168.` و `10.` و `.local`. ناقص:
`172.16–31.x` و `169.254.169.254` (Metadata بتاع الكلاود) و `0.0.0.0` و `[::1]`، وكمان `axios` بيتبع الـ redirects فممكن يوصل لعنوان داخلي.
وكمان مفيش فحص إن الرد صورة، فممكن يرجّع HTML من الدومين بتاعك.

**الحل:** Allowlist بدل Blocklist:

```ts
const ALLOWED_HOSTS = new Set(['ak.sv', 'img.ak.sv']); // حط دومينات الصور الحقيقية
isAllowedProxyUrl(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && ALLOWED_HOSTS.has(u.hostname);
  } catch { return false; }
}
// في الطلب:
{ maxRedirects: 0, maxContentLength: 5_000_000, responseType: 'arraybuffer' }
// وبعد الرد:
if (!String(contentType).startsWith('image/')) throw new Error('not an image');
```

## 🟠 3) الـ Rate Limit ممكن يتلاعب فيه

في `user-rate-limit.guard.ts` بتقرأ `X-Forwarded-For` بإيدك، وفي نفس الوقت عامل `trust proxy`. أي حد يبعت Header مختلف في كل طلب ويتخطى الحد.
**الحل:** استخدم `req.ip` بس (Express هيحسبه صح مع `trust proxy`)، واظبط عدد الـ proxies الحقيقي.

## 🟠 4) الـ Jobs في الذاكرة بس ومش بتتمسح

`AkwamJobsService` شايل `Map` من الـ jobs ومفيش حاجة بتمسحها:
- **Memory leak:** كل بحث بيفضل في الرام للأبد.
- لو السيرفر عمل restart، الـ BullMQ لسه فيه jobs في Redis، بس الـ Map فاضية فالـ worker هيفشل (`Job not found`).
- مينفعش تشغّل أكتر من instance.

**الحل:** خزّن حالة الـ job في Redis بـ TTL (مثلاً ساعة)، أو على الأقل `setTimeout` يمسح الـ job بعد ما يخلص بـ 30 دقيقة.

## 🟠 5) الـ SSE بيضيّع Events

`events$` عبارة عن `Subject` عادي، يعني لو الـ Client اشترك متأخر ثانية يفوته `candidates` أو `status`. ابعت Snapshot أول ما حد يشترك، أو استخدم `ReplaySubject(1)`.

## 🟠 6) مفيش Validation

مفيش `ValidationPipe` ولا DTOs. `selectedIds` ممكن تبقى أي حاجة، و`search` من غير حد أقصى للطول.
```bash
npm i class-validator class-transformer
```
```ts
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
```
واعمل DTO: `@IsString() @Length(1,100) search`، و `@IsInt({each:true}) @ArrayMaxSize(20) selectedIds`.
وتأكد إن `search` بيتعمله `encodeURIComponent` قبل ما يتحط في رابط `ak.sv/search?q=`.

## 🟠 7) ملفات ناقصة / README بيكذب

- README بيقول `cp .env.example .env` بس الملف **مش موجود**، وكمان `.gitignore` فيه `.env*` فهيتجاهله حتى لو عملته. زوّد `!.env.example`.
- README بيقول `REDIS_URL` شغال، بس `configuration.ts` مبيقراهوش خالص.
- `RedisService` بيفعّل TLS لو فيه password بس. لو عندك Redis لوكال بباسورد هيفشل. استخدم متغير `REDIS_TLS=true` صريح.

## 🟠 7.5) `npm install` بيفشل (ERESOLVE)

`@nestjs/swagger@^11` محتاج `@nestjs/common@^11` بس المشروع على NestJS 10 (`^10.0.0`). فأي حد يعمل clone ويكتب `npm install` هيتعطل. (اشتغل معايا بـ `--legacy-peer-deps`.)
**الحل:** إما ترقّي `@nestjs/common` و`core` و`platform-express` لـ 11، أو تنزّل swagger لـ `^8` (يوافق NestJS 10).

## 🟡 8) أمان عام

```bash
npm i helmet
```
```ts
app.use(helmet());
app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',') });
```
- اقفل Swagger في الـ production أو احميه.
- `DELETE /jobs/:id` من غير أي تحقق من صاحب الـ job (الـ UUID صعب يتخمن، فالخطورة قليلة، بس اربطه بـ IP/session).
- امسح `public/test.html` من الـ production.

## 🟡 9) جودة الكود

- `tsconfig`: `strict: false` و`strictNullChecks: false`. شغّلهم تدريجي.
- مفيش Tests ولا ESLint/Prettier (الكوت مخلوط `'` و`"`).
- `akwam.service.ts` فيه 572 سطر، قسّمه: `SearchService` / `ParserService` / `ImageProxyService`.
- ضيف `Dockerfile` للتطبيق نفسه (دلوقتي في Redis بس)، و`/health` endpoint.
- ضيف `@nestjs/throttler` بدل الحارس اليدوي لو حبيت.

## ⚖️ ملحوظة قانونية

الموقع المستهدف بيعرض محتوى عليه حقوق نشر. المشروع بيطلّع روابط تحميل مباشرة، وده ممكن يعرّض الريبو لـ DMCA takedown. حط Disclaimer في الـ README إن المشروع للتعلم، أو خليه Private.

## ✅ خطة التنفيذ المقترحة

1. غيّر الباسورد وشيله من الكود (10 دقايق).
2. Allowlist للـ proxy-image.
3. `req.ip` بدل `X-Forwarded-For`.
4. ValidationPipe + helmet.
5. نقل الـ jobs لـ Redis أو cleanup.
6. `.env.example` + تصحيح README.

</div>
