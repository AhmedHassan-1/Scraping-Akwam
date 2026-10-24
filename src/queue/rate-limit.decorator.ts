import { SetMetadata } from '@nestjs/common';

export interface RateLimitOptions {
  scope?: 'jobs' | 'images' | string;
  limit?: number;
  windowSec?: number;
}

export const RATE_LIMIT_METADATA_KEY = 'RATE_LIMIT_METADATA_KEY';

/**
 * Decorator to configure custom rate limiting per endpoint/controller
 *
 * @example
 * @RateLimit({ scope: 'images', limit: 150, windowSec: 60 })
 */
export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_METADATA_KEY, options);
