import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class QueueBypassMiddleware implements NestMiddleware {
  private readonly cookieName: string;
  private readonly cookieValue: string;

  constructor(config: ConfigService) {
    this.cookieName = config.get<string>(
      'queue.bypassCookieName',
      'access_queue',
    );
    this.cookieValue = config.get<string>(
      'queue.bypassCookieValue',
      'AhmedAdmin01557161078',
    );
  }

  use(req: Request, _res: Response, next: NextFunction): void {
    const cookie = req.cookies?.[this.cookieName];
    req.queueBypass = cookie === this.cookieValue;
    next();
  }
}
