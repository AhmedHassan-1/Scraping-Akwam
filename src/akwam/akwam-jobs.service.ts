import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Subject, Observable, map } from 'rxjs';
import { AkwamService } from './akwam.service';
import {
  JobEvent,
  JobSnapshot,
  JobStatus,
  ProgressState,
  SearchCandidate,
} from './interfaces/job.interfaces';
import { Movie, Series } from './interfaces/akwam.interfaces';

interface Job {
  id: string;
  search: string;
  status: JobStatus;
  candidates: SearchCandidate[];
  selectedIds: number[];
  progress: ProgressState;
  results: object[];
  movies: Movie[];
  series: Series[];
  error?: string;
  abortController: AbortController;
  events$: Subject<JobEvent>;
}

@Injectable()
export class AkwamJobsService {
  private readonly jobs = new Map<string, Job>();

  constructor(private readonly akwamService: AkwamService) {}

  createJob(search: string): JobSnapshot {
    const id = randomUUID();
    const job: Job = {
      id,
      search,
      status: 'discovering',
      candidates: [],
      selectedIds: [],
      progress: {
        phase: 'init',
        message: 'بدء البحث...',
        current: 0,
        total: 0,
        completedItems: 0,
      },
      results: [],
      movies: [],
      series: [],
      abortController: new AbortController(),
      events$: new Subject<JobEvent>(),
    };

    this.jobs.set(id, job);
    this.emit(job, 'status', { status: job.status });
    void this.runDiscover(job);
    return this.toSnapshot(job);
  }

  getSnapshot(id: string): JobSnapshot {
    const job = this.getJob(id);
    return this.toSnapshot(job);
  }

  getEventStream(id: string): Observable<MessageEvent> {
    const job = this.getJob(id);
    return job.events$.pipe(
      map(
        (event) =>
          ({
            data: JSON.stringify(event),
          }) as MessageEvent,
      ),
    );
  }

  async startProcessing(
    id: string,
    selectedIds: number[],
  ): Promise<JobSnapshot> {
    const job = this.getJob(id);

    if (job.status !== 'awaiting_selection') {
      throw new Error('لا يمكن بدء المعالجة في هذه الحالة');
    }

    if (!selectedIds?.length) {
      throw new Error('يجب اختيار عنصر واحد على الأقل');
    }

    const selected = job.candidates.filter((c) => selectedIds.includes(c.id));
    if (!selected.length) {
      throw new Error('لم يتم العثور على العناصر المحددة');
    }

    job.selectedIds = selectedIds;
    void this.runProcess(job, selected);
    return this.toSnapshot(job);
  }

  cancelJob(id: string): JobSnapshot {
    const job = this.getJob(id);

    if (['completed', 'cancelled', 'failed'].includes(job.status)) {
      return this.toSnapshot(job);
    }

    job.abortController.abort();
    job.status = 'cancelled';
    job.progress.message = 'تم إلغاء البحث';
    this.emit(job, 'cancelled', { status: job.status });
    this.emit(job, 'status', { status: job.status });
    job.events$.complete();
    return this.toSnapshot(job);
  }

  private async runDiscover(job: Job): Promise<void> {
    try {
      const candidates = await this.akwamService.discoverCandidates(
        job.search,
        job.abortController.signal,
        (p) => this.updateProgress(job, p),
      );

      if (job.abortController.signal.aborted) return;

      job.candidates = candidates;
      this.emit(job, 'candidates', { candidates });

      if (candidates.length === 0) {
        job.status = 'completed';
        job.progress.message = 'لا توجد نتائج';
        this.emit(job, 'complete', {
          results: [],
          status: job.status,
        });
        this.emit(job, 'status', { status: job.status });
        job.events$.complete();
        return;
      }

      if (candidates.length === 1) {
        await this.runProcess(job, candidates);
        return;
      }

      job.status = 'awaiting_selection';
      job.progress.message = `اختر من ${candidates.length} نتائج للمتابعة`;
      this.emit(job, 'status', { status: job.status });
    } catch (err) {
      if (job.abortController.signal.aborted) return;
      this.failJob(job, err);
    }
  }

  private async runProcess(
    job: Job,
    candidates: SearchCandidate[],
  ): Promise<void> {
    try {
      job.status = 'processing';
      job.progress.total = candidates.length;
      this.emit(job, 'status', { status: job.status });

      const { movies, series } = await this.akwamService.processCandidates(
        candidates,
        job.abortController.signal,
        (p) => this.updateProgress(job, p),
        (item, kind) => {
          if (kind === 'movie') {
            job.movies.push(item as Movie);
          } else {
            job.series.push(item as Series);
          }
          job.results = this.akwamService.formatPartialResults(
            job.movies,
            job.series,
          );
          job.progress.completedItems = job.movies.length + job.series.length;
          this.emit(job, 'item', {
            results: job.results,
            kind,
            title: (item as Movie).Title,
          });
        },
      );

      if (job.abortController.signal.aborted) return;

      job.movies = movies;
      job.series = series;
      job.results = this.akwamService.buildFinalResponse(movies, series);
      job.status = 'completed';
      job.progress.message = 'اكتمل البحث';
      job.progress.completedItems = movies.length + series.length;

      this.emit(job, 'complete', {
        results: job.results,
        status: job.status,
      });
      this.emit(job, 'status', { status: job.status });
      job.events$.complete();
    } catch (err) {
      if (job.abortController.signal.aborted) return;
      this.failJob(job, err);
    }
  }

  private updateProgress(job: Job, partial: Partial<ProgressState>): void {
    job.progress = { ...job.progress, ...partial };
    this.emit(job, 'progress', { progress: job.progress });
  }

  private failJob(job: Job, err: unknown): void {
    job.status = 'failed';
    job.error = err instanceof Error ? err.message : String(err);
    job.progress.message = job.error;
    this.emit(job, 'error', { message: job.error });
    this.emit(job, 'status', { status: job.status });
    job.events$.complete();
  }

  private emit(job: Job, type: JobEvent['type'], data: unknown): void {
    job.events$.next({ type, data });
  }

  private getJob(id: string): Job {
    const job = this.jobs.get(id);
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    return job;
  }

  private toSnapshot(job: Job): JobSnapshot {
    return {
      id: job.id,
      search: job.search,
      status: job.status,
      candidates: job.candidates,
      progress: job.progress,
      results: job.results,
      error: job.error,
    };
  }
}
