import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, Worker } from 'bullmq';
import { RedisService } from '../redis/redis.service';
import { AkwamJobsService } from './akwam-jobs.service';
import { QueueStatus } from './interfaces/queue.interfaces';

export type AkwamQueueJobType = 'discover' | 'process';

export interface AkwamQueuePayload {
  type: AkwamQueueJobType;
  jobId: string;
  selectedIds?: number[];
}

@Injectable()
export class AkwamQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AkwamQueueService.name);
  private queue!: Queue<AkwamQueuePayload>;
  private worker!: Worker<AkwamQueuePayload>;

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => AkwamJobsService))
    private readonly jobsService: AkwamJobsService,
  ) {}

  onModuleInit() {
    const connection = this.redis.getBullMqConnection();
    const concurrency = this.config.get<number>('queue.maxConcurrentJobs', 1);

    this.queue = new Queue<AkwamQueuePayload>('akwam-jobs', { connection });

    this.worker = new Worker<AkwamQueuePayload>(
      'akwam-jobs',
      async (job) => this.process(job),
      { connection, concurrency },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Queue job ${job?.id} failed: ${err.message}`);
    });

    const refreshAll = () => void this.jobsService.refreshAllQueuedPositions();

    this.worker.on('active', refreshAll);
    this.worker.on('completed', refreshAll);
    this.worker.on('failed', refreshAll);
    this.queue.on('waiting', refreshAll);

    this.logger.log(
      `Queue worker started (concurrency=${concurrency}, scrape rate from env)`,
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  /** Server-assigned priority (users cannot set this). Admin bypass = highest. */
  resolveUserPriority(bypass: boolean): number {
    if (bypass) return 100;
    return this.config.get<number>('queue.defaultPriority', 10);
  }

  /**
   * BullMQ: lower number = runs sooner (1 is highest among prioritized jobs).
   * Maps user 100 → bull 1, user 1 → bull 100.
   */
  toBullPriority(userPriority: number, bypass: boolean): number {
    if (bypass) return 1;
    return 101 - userPriority;
  }

  async addDiscoverJob(jobId: string, bullPriority: number): Promise<void> {
    await this.queue.add(
      'discover',
      { type: 'discover', jobId },
      {
        jobId: `discover-${jobId}`,
        priority: bullPriority,
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
    void this.jobsService.refreshAllQueuedPositions();
  }

  async addProcessJob(
    jobId: string,
    selectedIds: number[],
    bullPriority: number,
  ): Promise<void> {
    await this.queue.add(
      'process',
      { type: 'process', jobId, selectedIds },
      {
        jobId: `process-${jobId}-${Date.now()}`,
        priority: bullPriority,
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
    void this.jobsService.refreshAllQueuedPositions();
  }

  /** Jobs in the order BullMQ will run them (ascending priority value). */
  private async getWaitingInRunOrder(): Promise<Job<AkwamQueuePayload>[]> {
    const prioritized = await this.queue.getJobs(['prioritized'], 0, -1, true);
    const waiting = await this.queue.getJobs(['waiting'], 0, -1, true);
    return [...prioritized, ...waiting];
  }

  async getQueueStatus(jobId: string): Promise<QueueStatus> {
    const active = await this.queue.getActive();
    const activeJob = active.find((j) => j.data.jobId === jobId);
    if (activeJob) {
      const waiting = await this.getWaitingInRunOrder();
      return {
        position: 0,
        waitingTotal: waiting.length,
        ahead: 0,
        isActive: true,
      };
    }

    const ordered = await this.getWaitingInRunOrder();
    const index = ordered.findIndex((j) => j.data.jobId === jobId);

    if (index < 0) {
      return {
        position: 0,
        waitingTotal: ordered.length,
        ahead: 0,
        isActive: false,
      };
    }

    return {
      position: index + 1,
      waitingTotal: ordered.length,
      ahead: index,
      isActive: false,
    };
  }

  private async process(job: Job<AkwamQueuePayload>): Promise<void> {
    const { type, jobId, selectedIds } = job.data;
    if (type === 'discover') {
      await this.jobsService.executeDiscover(jobId);
      return;
    }
    if (type === 'process' && selectedIds?.length) {
      await this.jobsService.executeProcess(jobId, selectedIds);
    }
  }
}
