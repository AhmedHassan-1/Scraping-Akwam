import { Inject, Injectable } from '@nestjs/common';
import { IScraperService } from '../../core/interfaces/scraper.interface';

@Injectable()
export class SyncSearchUseCase {
  constructor(
    @Inject('IScraperService')
    private readonly scraperService: IScraperService,
  ) {}

  async execute(search: string): Promise<any[]> {
    const candidates = await this.scraperService.discoverCandidates(search);
    const { movies, series } = await this.scraperService.processCandidates(candidates);
    return this.scraperService.buildLegacyResponse(movies, series);
  }
}
