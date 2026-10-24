import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class UserRateLimitGuard implements CanActivate {
  private readonly limit: number;
  private readonly windowSec: number;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    this.limit = config.get<number>('rateLimit.perUser', 10);
    this.windowSec = config.get<number>('rateLimit.windowSec', 60);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    // Skip rate limiting if admin bypass cookie was verified
    if (req.queueBypass) return true;

    const userKey = this.resolveUserKey(req);
    const redisKey = `ratelimit:user:${userKey}`;
    const count = await this.redis.client.incr(redisKey);

    if (count === 1) {
      await this.redis.client.expire(redisKey, this.windowSec);
    }

    const ttl = await this.redis.client.ttl(redisKey);
    const resetTime = ttl > 0 ? ttl : this.windowSec;

    // Set standard RateLimit headers
    res.setHeader('X-RateLimit-Limit', this.limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, this.limit - count));
    res.setHeader('X-RateLimit-Reset', resetTime);

    if (count > this.limit) {
      res.setHeader('Retry-After', resetTime);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: `تجاوزت الحد الأقصى للطلبات (${this.limit} طلب كل ${this.windowSec} ثانية). يرجى الانتظار لمدة ${resetTime} ثانية قبل إعادة المحاولة.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private resolveUserKey(req: Request): string {
    const rawIp = req.ip || req.socket.remoteAddress || 'unknown';
    // Normalize IPv6 mapped IPv4 and loopback
    let normalized = rawIp.replace(/^::ffff:/, '');
    if (normalized === '::1') normalized = '127.0.0.1';
    return normalized;
  }
}
