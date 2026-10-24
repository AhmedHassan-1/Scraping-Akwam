import { Inject, Injectable } from '@nestjs/common';
import { IScraperService } from '../../core/interfaces/scraper.interface';
import { IImageCache } from '../../core/interfaces/image-cache.interface';

@Injectable()
export class ProxyImageUseCase {
  constructor(
    @Inject('IScraperService')
    private readonly scraperService: IScraperService,
    @Inject('IImageCache')
    private readonly imageCache: IImageCache,
  ) {}

  async execute(url: string): Promise<{ buffer: Buffer; contentType: string }> {
    const cached = await this.imageCache.get(url);
    if (cached) {
      return cached;
    }

    const result = await this.scraperService.fetchProxiedImage(url);
    await this.imageCache.set(url, result, 86400);

    return result;
  }
}
