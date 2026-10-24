import { Injectable, Logger } from '@nestjs/common';
import { Movie } from '../../core/domain/entities/movie.entity';
import { Series } from '../../core/domain/entities/series.entity';
import { Episode } from '../../core/domain/entities/episode.entity';
import { SearchCandidate } from '../../core/domain/entities/search-candidate.entity';
import {
  ItemCompleteCallback,
  ProgressCallback,
} from '../../core/interfaces/scraper.interface';
import { AkwamHttpClient } from './akwam-http-client.service';
import { AkwamDownloadResolverService } from './akwam-download-resolver.service';
import { MediaDetailsParser } from './parsers/media-details.parser';
import { DownloadLinksParser } from './parsers/download-links.parser';

@Injectable()
export class AkwamMediaService {
  private readonly logger = new Logger(AkwamMediaService.name);

  constructor(
    private readonly httpClient: AkwamHttpClient,
    private readonly downloadResolver: AkwamDownloadResolverService,
  ) {}

  async processCandidates(
    candidates: SearchCandidate[],
    signal?: AbortSignal,
    onProgress?: ProgressCallback,
    onItemComplete?: ItemCompleteCallback,
  ): Promise<{ movies: Movie[]; series: Series[] }> {
    const movies: Movie[] = [];
    const series: Series[] = [];
    const total = candidates.length;

    for (let i = 0; i < candidates.length; i++) {
      if (signal?.aborted) break;

      const candidate = candidates[i];
      onProgress?.({
        phase: 'item',
        message: `جاري معالجة: ${candidate.title}`,
        current: i + 1,
        total,
        completedItems: movies.length + series.length,
      });

      const parsed = await this.processItem(
        candidate.url,
        candidate.title,
        signal,
        (msg) => {
          onProgress?.({
            phase: 'detail',
            message: `${candidate.title}: ${msg}`,
            current: i + 1,
            total,
            completedItems: movies.length + series.length,
          });
        },
      );

      if (!parsed) continue;

      if (parsed.isSeries && parsed.series) {
        series.push(parsed.series);
        onItemComplete?.(parsed.series, 'series');
        onProgress?.({
          phase: 'item_done',
          message: `اكتمل المسلسل: ${candidate.title}`,
          current: i + 1,
          total,
          completedItems: movies.length + series.length,
        });
      } else if (parsed.movie) {
        movies.push(parsed.movie);
        onItemComplete?.(parsed.movie, 'movie');
        onProgress?.({
          phase: 'item_done',
          message: `اكتمل الفيلم: ${candidate.title}`,
          current: i + 1,
          total,
          completedItems: movies.length + series.length,
        });
      }
    }

    return { movies, series };
  }

  private async processItem(
    link: string,
    fallbackTitle: string,
    signal?: AbortSignal,
    onDetailProgress?: (message: string) => void,
  ): Promise<{ isSeries: boolean; movie?: Movie; series?: Series } | null> {
    const itemRes = await this.httpClient.get(link, { signal });
    const parsedDetails = MediaDetailsParser.parse(
      Buffer.from(itemRes.data),
      fallbackTitle,
    );

    if (parsedDetails.isSeries && parsedDetails.series && parsedDetails.episodeUrls) {
      return this.processSeriesEpisodes(
        parsedDetails.series,
        parsedDetails.episodeUrls,
        signal,
        onDetailProgress,
      );
    }

    if (parsedDetails.movie) {
      return this.processMovieDetails(
        parsedDetails.movie,
        signal,
        onDetailProgress,
      );
    }

    return null;
  }

  private async processSeriesEpisodes(
    series: Series,
    episodeUrls: string[],
    signal?: AbortSignal,
    onDetailProgress?: (message: string) => void,
  ): Promise<{ isSeries: boolean; series: Series }> {
    const epResults: (Episode | null)[] = [];
    const epTotal = episodeUrls.length;

    for (let epIdx = 0; epIdx < episodeUrls.length; epIdx++) {
      if (signal?.aborted) break;

      const epLink = episodeUrls[epIdx];
      onDetailProgress?.(`الحلقة ${epIdx + 1} من ${epTotal}`);

      const epRes = await this.httpClient.get(epLink, { signal });
      const epBuffer = Buffer.from(epRes.data);
      const epTitle = DownloadLinksParser.parseEpisodeHeader(epBuffer);
      const qualities = DownloadLinksParser.parseEpisodeQualities(epBuffer);

      const resolvedQualities = await this.downloadResolver.resolveQualitiesSequential(
        qualities,
        signal,
        (qName) => {
          onDetailProgress?.(`الحلقة ${epIdx + 1}: جودة ${qName}`);
        },
      );

      epResults.push({
        title: epTitle,
        qualities: resolvedQualities,
      } as Episode);
    }

    series.episodes = epResults.filter(Boolean) as Episode[];
    return { isSeries: true, series };
  }

  private async processMovieDetails(
    movie: Movie,
    signal?: AbortSignal,
    onDetailProgress?: (message: string) => void,
  ): Promise<{ isSeries: boolean; movie: Movie }> {
    onDetailProgress?.('جاري جلب روابط التحميل...');
    movie.qualities = await this.downloadResolver.resolveQualitiesSequential(
      movie.qualities,
      signal,
      (qName) => onDetailProgress?.(`جودة ${qName}`),
    );
    return { isSeries: false, movie };
  }
}
