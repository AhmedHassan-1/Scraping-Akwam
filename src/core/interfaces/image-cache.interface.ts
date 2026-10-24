export interface IImageCache {
  get(url: string): Promise<{ buffer: Buffer; contentType: string } | null>;
  set(url: string, image: { buffer: Buffer; contentType: string }, ttlSeconds?: number): Promise<void>;
}
