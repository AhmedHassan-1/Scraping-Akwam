import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('redis.host', '127.0.0.1');
    const port = this.config.get<number>('redis.port', 6379);
    const password = this.config.get<string>('redis.password');

    this.client = new Redis({
      host,
      port,
      password: password || undefined,
      maxRetriesPerRequest: null,
    });
  }

  onModuleDestroy() {
    this.client.disconnect();
  }

  /** Separate connection options for BullMQ (requires maxRetriesPerRequest: null). */
  getBullMqConnection(): {
    host: string;
    port: number;
    password?: string;
    maxRetriesPerRequest: null;
  } {
    const host = this.config.get<string>('redis.host', '127.0.0.1');
    const port = this.config.get<number>('redis.port', 6379);
    const password = this.config.get<string>('redis.password');
    return {
      host,
      port,
      password: password || undefined,
      maxRetriesPerRequest: null,
    };
  }
}
