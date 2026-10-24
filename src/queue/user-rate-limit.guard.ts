import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { RedisService } from '../redis/redis.service';
import {
  RATE_LIMIT_METADATA_KEY,
  RateLimitOptions,
} from './rate-limit.decorator';

@Injectable()
export class UserRateLimitGuard implements CanActivate {
  private readonly defaultWindowSec: number;
  private readonly defaultJobsLimit: number;
  private readonly defaultImagesLimit: number;

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {
    this.defaultWindowSec = this.config.get<number>(
      'rateLimit.windowSec',
      60,
    );
    this.defaultJobsLimit = this.config.get<number>(
      'rateLimit.jobsPerUser',
      30,
    );
    this.defaultImagesLimit = this.config.get<number>(
      'rateLimit.imagesPerUser',
      150,
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    // Skip rate limiting if admin bypass cookie was verified
    if (req.queueBypass) return true;

    // Read metadata if attached to endpoint or controller
    const metadata = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(
      RATE_LIMIT_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    const scope = metadata?.scope || 'jobs';
    const windowSec = metadata?.windowSec || this.defaultWindowSec;
    let limit = metadata?.limit;

    if (!limit) {
      limit =
        scope === 'images' ? this.defaultImagesLimit : this.defaultJobsLimit;
    }

    const userKey = this.resolveUserKey(req);
    const redisKey = `ratelimit:${scope}:${userKey}`;
    const count = await this.redis.client.incr(redisKey);

    if (count === 1) {
      await this.redis.client.expire(redisKey, windowSec);
    }

    const ttl = await this.redis.client.ttl(redisKey);
    const resetTime = ttl > 0 ? ttl : windowSec;

    // Set standard RateLimit headers for this specific scope
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - count));
    res.setHeader('X-RateLimit-Reset', resetTime);
    res.setHeader('X-RateLimit-Scope', scope);

    if (count > limit) {
      res.setHeader('Retry-After', resetTime);
      const scopeDesc = scope === 'images' ? 'لجلب الصور' : 'للعمليات والمهام';
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: `تجاوزت الحد الأقصى ${scopeDesc} (${limit} طلب كل ${windowSec} ثانية). يرجى الانتظار لمدة ${resetTime} ثانية قبل إعادة المحاولة.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private resolveUserKey(req: Request): string {
    const rawIp = req.ip || req.socket.remoteAddress || 'unknown';
    let normalized = rawIp.replace(/^::ffff:/, '');
    if (normalized === '::1') normalized = '127.0.0.1';
    return normalized;
  }
}
