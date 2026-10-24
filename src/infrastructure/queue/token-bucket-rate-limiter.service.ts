import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IRateLimiter } from '../../core/interfaces/rate-limiter.interface';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class TokenBucketRateLimiterService implements IRateLimiter {
  private readonly maxPerSecond: number;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    const rate = config.get<number>('queue.scrapeRequestsPerSecond', 1);
    this.maxPerSecond = Math.max(0.1, rate);
  }

  async acquire(): Promise<void> {
    const minIntervalMs = Math.ceil(1000 / this.maxPerSecond);

    while (true) {
      const allowed = await this.tryTakeSlot();
      if (allowed) return;
      await new Promise((resolve) => setTimeout(resolve, minIntervalMs));
    }
  }

  private async tryTakeSlot(): Promise<boolean> {
    const second = Math.floor(Date.now() / 1000);
    const key = `scrape:rate:${second}`;
    const count = await this.redis.client.incr(key);
    if (count === 1) {
      await this.redis.client.expire(key, 2);
    }
    return count <= Math.ceil(this.maxPerSecond);
  }
}
