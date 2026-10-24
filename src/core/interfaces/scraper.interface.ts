import { Movie } from '../domain/entities/movie.entity';
import { Series } from '../domain/entities/series.entity';
import { SearchCandidate } from '../domain/entities/search-candidate.entity';
import { ProgressState } from '../domain/entities/job.entity';

export type ProgressCallback = (progress: Partial<ProgressState>) => void;
export type ItemCompleteCallback = (item: Movie | Series, kind: 'movie' | 'series') => void;

export interface IScraperService {
  discoverCandidates(
    search: string,
    signal?: AbortSignal,
    onProgress?: ProgressCallback,
  ): Promise<SearchCandidate[]>;

  processCandidates(
    candidates: SearchCandidate[],
    signal?: AbortSignal,
    onProgress?: ProgressCallback,
    onItemComplete?: ItemCompleteCallback,
  ): Promise<{ movies: Movie[]; series: Series[] }>;

  fetchProxiedImage(url: string): Promise<{ buffer: Buffer; contentType: string }>;

  buildLegacyResponse(movies: Movie[], series: Series[]): any[];
}

/** Backward compatibility alias */
export type ISraperService = IScraperService;
