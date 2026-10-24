export interface IRateLimiter {
  acquire(): Promise<void>;
}
