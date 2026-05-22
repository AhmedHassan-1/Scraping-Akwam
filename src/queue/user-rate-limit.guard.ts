import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
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
    const req = context.switchToHttp().getRequest<Request>();
    if (req.queueBypass) return true;

    const userKey = this.resolveUserKey(req);
    const redisKey = `ratelimit:user:${userKey}`;
    const count = await this.redis.client.incr(redisKey);
    if (count === 1) {
      await this.redis.client.expire(redisKey, this.windowSec);
    }

    if (count > this.limit) {
      const ttl = await this.redis.client.ttl(redisKey);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `تجاوزت الحد المسموح (${this.limit} طلب كل ${this.windowSec} ثانية). حاول بعد ${ttl > 0 ? ttl : this.windowSec} ثانية.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private resolveUserKey(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length) {
      return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket.remoteAddress || 'unknown';
  }
}
