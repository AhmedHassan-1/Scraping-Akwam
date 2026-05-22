export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
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
    bypassCookieValue:
      process.env.QUEUE_BYPASS_COOKIE_VALUE || 'AhmedAdmin01557161078',
  },
  rateLimit: {
    perUser: parseInt(process.env.RATE_LIMIT_PER_USER || '10', 10),
    windowSec: parseInt(process.env.RATE_LIMIT_WINDOW_SEC || '60', 10),
  },
});
