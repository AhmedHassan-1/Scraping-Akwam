import { Injectable, Logger } from '@nestjs/common';
import { SearchCandidate } from '../../core/domain/entities/search-candidate.entity';
import { ProgressCallback } from '../../core/interfaces/scraper.interface';
import { AkwamHttpClient } from './akwam-http-client.service';
import { SearchPageParser } from './parsers/search-page.parser';

@Injectable()
export class AkwamSearchService {
  private readonly logger = new Logger(AkwamSearchService.name);

  constructor(private readonly httpClient: AkwamHttpClient) {}

  async discoverCandidates(
    search: string,
    signal?: AbortSignal,
    onProgress?: ProgressCallback,
  ): Promise<SearchCandidate[]> {
    onProgress?.({
      phase: 'discover',
      message: 'جاري البحث في موقع أكوام...',
      current: 0,
      total: 1,
    });

    const searchUrl = `${this.httpClient.siteOrigin}/search?q=${encodeURIComponent(search)}`;
    const response = await this.httpClient.get(searchUrl, { signal });

    const candidates = SearchPageParser.parse(Buffer.from(response.data));

    onProgress?.({
      phase: 'discover',
      message: `تم العثور على ${candidates.length} نتيجة`,
      current: 1,
      total: 1,
    });

    return candidates;
  }
}
