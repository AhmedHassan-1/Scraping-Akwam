import { Injectable } from '@nestjs/common';
import { Movie } from '../../core/domain/entities/movie.entity';
import { Series } from '../../core/domain/entities/series.entity';
import { SearchCandidate } from '../../core/domain/entities/search-candidate.entity';
import {
  IScraperService,
  ItemCompleteCallback,
  ProgressCallback,
} from '../../core/interfaces/scraper.interface';
import { AkwamSearchService } from './akwam-search.service';
import { AkwamMediaService } from './akwam-media.service';
import { AkwamImageProxyService } from './akwam-image-proxy.service';
import { LegacyResponseFormatter } from './legacy-response-formatter.service';

@Injectable()
export class AkwamHtmlScraperService implements IScraperService {
  constructor(
    private readonly searchService: AkwamSearchService,
    private readonly mediaService: AkwamMediaService,
    private readonly imageProxyService: AkwamImageProxyService,
    private readonly responseFormatter: LegacyResponseFormatter,
  ) {}

  async discoverCandidates(
    search: string,
    signal?: AbortSignal,
    onProgress?: ProgressCallback,
  ): Promise<SearchCandidate[]> {
    return this.searchService.discoverCandidates(search, signal, onProgress);
  }

  async processCandidates(
    candidates: SearchCandidate[],
    signal?: AbortSignal,
    onProgress?: ProgressCallback,
    onItemComplete?: ItemCompleteCallback,
  ): Promise<{ movies: Movie[]; series: Series[] }> {
    return this.mediaService.processCandidates(
      candidates,
      signal,
      onProgress,
      onItemComplete,
    );
  }

  async fetchProxiedImage(
    url: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    return this.imageProxyService.fetchProxiedImage(url);
  }

  buildLegacyResponse(movies: Movie[], series: Series[]): any[] {
    return this.responseFormatter.format(movies, series);
  }
}
