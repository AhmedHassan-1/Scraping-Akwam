import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class QueueBypassMiddleware implements NestMiddleware {
  private readonly cookieName: string;
  private readonly cookieValue: string;

  constructor(config: ConfigService) {
    this.cookieName = config.get<string>(
      'queue.bypassCookieName',
      'access_queue',
    );
    this.cookieValue = config.get<string>('queue.bypassCookieValue', '');
  }

  use(req: Request, _res: Response, next: NextFunction): void {
    const cookie = req.cookies?.[this.cookieName];

    if (!this.cookieValue || typeof cookie !== 'string') {
      req.queueBypass = false;
      return next();
    }

    try {
      const a = Buffer.from(cookie, 'utf8');
      const b = Buffer.from(this.cookieValue, 'utf8');

      if (a.length !== b.length) {
        req.queueBypass = false;
      } else {
        req.queueBypass = timingSafeEqual(a, b);
      }
    } catch {
      req.queueBypass = false;
    }

    next();
  }
}
