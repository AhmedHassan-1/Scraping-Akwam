import { Injectable } from '@nestjs/common';
import { IImageCache } from '../../core/interfaces/image-cache.interface';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class RedisImageCacheService implements IImageCache {
  private readonly prefix = 'img:cache:';

  constructor(private readonly redis: RedisService) {}

  async get(url: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    const key = `${this.prefix}${Buffer.from(url).toString('base64url')}`;
    const data = await this.redis.client.hgetall(key);

    if (!data || !data.buffer || !data.contentType) {
      return null;
    }

    return {
      buffer: Buffer.from(data.buffer, 'base64'),
      contentType: data.contentType,
    };
  }

  async set(
    url: string,
    image: { buffer: Buffer; contentType: string },
    ttlSeconds: number = 86400,
  ): Promise<void> {
    const key = `${this.prefix}${Buffer.from(url).toString('base64url')}`;
    await this.redis.client.hmset(key, {
      buffer: image.buffer.toString('base64'),
      contentType: image.contentType,
    });
    await this.redis.client.expire(key, ttlSeconds);
  }
}
