import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import { RedisService } from '../../redis/redis.service';
import { AkwamJobPayload } from './bullmq-queue.service';
import { IScraperService } from '../../core/interfaces/scraper.interface';
import { IJobRepository } from '../../core/interfaces/job-repository.interface';
import { Movie } from '../../core/domain/entities/movie.entity';
import { Series } from '../../core/domain/entities/series.entity';

@Injectable()
export class AkwamJobProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AkwamJobProcessor.name);
  private worker!: Worker<AkwamJobPayload>;

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    @Inject('IScraperService')
    private readonly scraperService: IScraperService,
    @Inject('IJobRepository')
    private readonly jobRepository: IJobRepository,
  ) {}

  onModuleInit() {
    const connection = this.redis.getBullMqConnection();
    const concurrency = this.config.get<number>('queue.maxConcurrentJobs', 1);

    this.worker = new Worker<AkwamJobPayload>(
      'akwam-jobs',
      async (job) => this.processJob(job),
      { connection, concurrency },
    );

    this.worker.on('error', (err) => {
      this.logger.warn(`BullMQ Worker Redis connection event: ${err.message}`);
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Queue job ${job?.id} failed: ${err.message}`);
    });

    this.logger.log(`AkwamJobProcessor worker started (concurrency=${concurrency})`);
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async processJob(job: Job<AkwamJobPayload>): Promise<void> {
    const { type, jobId, selectedIds } = job.data;

    if (type === 'discover') {
      await this.executeDiscover(jobId);
    } else if (type === 'process' && selectedIds?.length) {
      await this.executeProcess(jobId, selectedIds);
    }
  }

  private async executeDiscover(jobId: string): Promise<void> {
    const job = await this.jobRepository.findById(jobId);
    if (!job || job.status === 'cancelled') return;

    job.queuePosition = 0;
    job.status = 'discovering';
    job.progress.phase = 'discover';
    job.progress.message = 'جاري البحث في الموقع...';
    await this.jobRepository.save(job);
    await this.jobRepository.publishEvent(jobId, { type: 'status', data: { status: job.status } });

    try {
      const candidates = await this.scraperService.discoverCandidates(
        job.search,
        undefined,
        async (progress) => {
          job.progress = { ...job.progress, ...progress };
          await this.jobRepository.save(job);
          await this.jobRepository.publishEvent(jobId, { type: 'progress', data: { progress: job.progress } });
        },
      );

      job.candidates = candidates;
      await this.jobRepository.publishEvent(jobId, { type: 'candidates', data: { candidates } });

      if (candidates.length === 0) {
        job.status = 'completed';
        job.progress.message = 'لا توجد نتائج مطابقة للبحث';
        await this.jobRepository.save(job);
        await this.jobRepository.publishEvent(jobId, { type: 'complete', data: { results: [], status: job.status } });
        await this.jobRepository.publishEvent(jobId, { type: 'status', data: { status: job.status } });
        return;
      }

      job.status = 'awaiting_selection';
      job.progress.message =
        candidates.length === 1
          ? 'تم العثور على نتيجة واحدة — راجعها ثم اضغط «بدء المعالجة»'
          : `اختر من ${candidates.length} نتائج ثم اضغط «بدء المعالجة»`;

      await this.jobRepository.save(job);
      await this.jobRepository.publishEvent(jobId, { type: 'status', data: { status: job.status } });
    } catch (err) {
      await this.failJob(jobId, err);
    }
  }

  private async executeProcess(jobId: string, selectedIds: number[]): Promise<void> {
    const job = await this.jobRepository.findById(jobId);
    if (!job || job.status === 'cancelled') return;

    const selected = job.candidates.filter((c) => selectedIds.includes(c.id));
    if (!selected.length) {
      await this.failJob(jobId, new Error('لم يتم العثور على العناصر المحددة'));
      return;
    }

    job.queuePosition = 0;
    job.selectedIds = selectedIds;
    job.status = 'processing';
    job.progress.total = selected.length;
    await this.jobRepository.save(job);
    await this.jobRepository.publishEvent(jobId, { type: 'status', data: { status: job.status } });

    try {
      const { movies, series } = await this.scraperService.processCandidates(
        selected,
        undefined,
        async (progress) => {
          job.progress = { ...job.progress, ...progress };
          await this.jobRepository.save(job);
          await this.jobRepository.publishEvent(jobId, { type: 'progress', data: { progress: job.progress } });
        },
        async (item, kind) => {
          if (kind === 'movie') {
            const exists = job.movies.some((m) => m.title === item.title);
            if (!exists) job.movies.push(item as Movie);
          } else {
            const sIdx = job.series.findIndex((s) => s.title === item.title);
            if (sIdx >= 0) {
              job.series[sIdx] = item as Series;
            } else {
              job.series.push(item as Series);
            }
          }
          job.results = this.scraperService.buildLegacyResponse(job.movies, job.series);
          job.progress.completedItems = job.movies.length + job.series.length;

          await this.jobRepository.save(job);
          await this.jobRepository.publishEvent(jobId, {
            type: 'item',
            data: {
              results: job.results,
              kind,
              title: item.title,
            },
          });
        },
        async (seriesItem, episode) => {
          // Real-time live streaming of each episode!
          const sIdx = job.series.findIndex((s) => s.title === seriesItem.title);
          if (sIdx >= 0) {
            job.series[sIdx] = seriesItem;
          } else {
            job.series.push(seriesItem);
          }
          job.results = this.scraperService.buildLegacyResponse(job.movies, job.series);
          await this.jobRepository.save(job);
          await this.jobRepository.publishEvent(jobId, {
            type: 'item',
            data: {
              results: job.results,
              kind: 'episode',
              title: `${seriesItem.title} — ${episode.title}`,
              seriesTitle: seriesItem.title,
            },
          });
        },
      );

      job.movies = movies;
      job.series = series;
      job.results = this.scraperService.buildLegacyResponse(movies, series);
      job.status = 'completed';
      job.progress.message = 'اكتمل البحث واستخراج جميع الروابط';
      job.progress.completedItems = movies.length + series.length;

      await this.jobRepository.save(job);
      await this.jobRepository.publishEvent(jobId, { type: 'complete', data: { results: job.results, status: job.status } });
      await this.jobRepository.publishEvent(jobId, { type: 'status', data: { status: job.status } });
    } catch (err) {
      await this.failJob(jobId, err);
    }
  }

  private async failJob(jobId: string, err: unknown): Promise<void> {
    const job = await this.jobRepository.findById(jobId);
    if (!job) return;

    job.status = 'failed';
    job.error = err instanceof Error ? err.message : String(err);
    job.progress.message = job.error;

    await this.jobRepository.save(job);
    await this.jobRepository.publishEvent(jobId, { type: 'error', data: { message: job.error } });
    await this.jobRepository.publishEvent(jobId, { type: 'status', data: { status: job.status } });
  }
}
