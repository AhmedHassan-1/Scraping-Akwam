import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(private readonly config: ConfigService) {
    const options = this.getRedisOptions();

    if (options.url) {
      this.client = new Redis(options.url, options);
    } else {
      this.client = new Redis(options);
    }

    this.client.on('connect', () => {
      this.logger.log('Redis Connected successfully');
    });

    this.client.on('error', (err) => {
      this.logger.error(`Redis Error: ${err.message}`);
    });
  }

  onModuleDestroy() {
    this.client.disconnect();
  }

  /**
   * إعدادات اتصال منفصلة لـ BullMQ (لا يشارك نفس Connection الخاص بـ Client)
   */
  getBullMqConnection(): RedisOptions {
    const opts = this.getRedisOptions();
    return {
      host: opts.host,
      port: opts.port,
      username: opts.username,
      password: opts.password,
      tls: opts.tls,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      keepAlive: 30000,
      connectTimeout: 10000,
    };
  }

  /**
   * استخراج وبناء خيارات الاتصال بـ Redis سواء عبر REDIS_URL أو المعاملات المفردة
   */
  private getRedisOptions(): RedisOptions & { url?: string } {
    const url = this.config.get<string>('redis.url');
    const host = this.config.get<string>('redis.host', '127.0.0.1');
    const port = this.config.get<number>('redis.port', 6379);
    const username = this.config.get<string>('redis.username');
    const password = this.config.get<string>('redis.password');
    const tls = this.config.get<object | undefined>('redis.tls');

    return {
      url: url || undefined,
      host,
      port,
      username: username || undefined,
      password: password || undefined,
      tls: tls || (password ? {} : undefined),
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      keepAlive: 30000,
      connectTimeout: 10000,
    };
  }
}
