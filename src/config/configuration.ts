export default () => {
  const redisUrl =
    process.env.REDIS_URL ||
    process.env.KV_URL ||
    process.env.UPSTASH_REDIS_URL;

  let redisHost = process.env.REDIS_HOST || '127.0.0.1';
  let redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
  let redisUsername = process.env.REDIS_USERNAME || undefined;
  let redisPassword = process.env.REDIS_PASSWORD || undefined;
  let useTls =
    process.env.REDIS_TLS === 'true' ||
    Boolean(redisUrl?.startsWith('rediss://'));

  if (redisUrl) {
    try {
      const parsed = new URL(redisUrl);
      redisHost = parsed.hostname;
      redisPort = parseInt(
        parsed.port || (parsed.protocol === 'rediss:' ? '6379' : '6379'),
        10,
      );
      if (parsed.username) redisUsername = decodeURIComponent(parsed.username);
      if (parsed.password) redisPassword = decodeURIComponent(parsed.password);
      if (parsed.protocol === 'rediss:') useTls = true;
    } catch {
      // ignore URL parsing error and use fallback values
    }
  }

  return {
    port: parseInt(process.env.PORT || '3000', 10),
    redis: {
      url: redisUrl || undefined,
      host: redisHost,
      port: redisPort,
      username: redisUsername,
      password: redisPassword,
      tls: useTls ? {} : undefined,
    },
    queue: {
      scrapeRequestsPerSecond: parseFloat(
        process.env.SCRAPE_REQUESTS_PER_SECOND || '1',
      ),
      maxConcurrentJobs: parseInt(
        process.env.QUEUE_MAX_CONCURRENT_JOBS || '1',
        10,
      ),
      defaultPriority: parseInt(process.env.QUEUE_DEFAULT_PRIORITY || '10', 10),
      adminPriority: parseInt(process.env.QUEUE_ADMIN_PRIORITY || '1000000', 10),
      bypassCookieName: process.env.QUEUE_BYPASS_COOKIE_NAME || 'access_queue',
      bypassCookieValue: process.env.QUEUE_BYPASS_COOKIE_VALUE || '',
    },
    rateLimit: {
      perUser: parseInt(
        process.env.RATE_LIMIT_JOBS_PER_USER ||
          process.env.RATE_LIMIT_PER_USER ||
          '30',
        10,
      ),
      jobsPerUser: parseInt(
        process.env.RATE_LIMIT_JOBS_PER_USER ||
          process.env.RATE_LIMIT_PER_USER ||
          '30',
        10,
      ),
      imagesPerUser: parseInt(
        process.env.RATE_LIMIT_IMAGES_PER_USER || '150',
        10,
      ),
      windowSec: parseInt(process.env.RATE_LIMIT_WINDOW_SEC || '60', 10),
    },
  };
};
