import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, Worker } from 'bullmq';
import { RedisService } from '../../redis/redis.service';
import {
  IQueueProvider,
  QueueStatusResult,
  QueueMetricsResult,
} from '../../core/interfaces/queue-provider.interface';

export type AkwamJobType = 'discover' | 'process';

export interface AkwamJobPayload {
  type: AkwamJobType;
  jobId: string;
  selectedIds?: number[];
}

@Injectable()
export class BullMqQueueService implements IQueueProvider, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BullMqQueueService.name);
  public queue!: Queue<AkwamJobPayload>;
  public worker!: Worker<AkwamJobPayload>;

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const connection = this.redis.getBullMqConnection();
    const concurrency = this.config.get<number>('queue.maxConcurrentJobs', 1);

    this.queue = new Queue<AkwamJobPayload>('akwam-jobs', { connection });
    this.logger.log(`BullMQ Queue initialized (concurrency=${concurrency})`);
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  resolveUserPriority(bypass: boolean): number {
    if (bypass) return 100;
    return this.config.get<number>('queue.defaultPriority', 10);
  }

  toBullPriority(userPriority: number, bypass: boolean): number {
    if (bypass) return 1;
    return 101 - userPriority;
  }

  async addDiscoverJob(jobId: string, bullPriority: number): Promise<void> {
    await this.queue.add(
      'discover',
      { type: 'discover', jobId },
      {
        priority: bullPriority,
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );
  }

  async addProcessJob(jobId: string, selectedIds: number[], bullPriority: number): Promise<void> {
    await this.queue.add(
      'process',
      { type: 'process', jobId, selectedIds },
      {
        priority: bullPriority,
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );
  }

  private async getWaitingInRunOrder(): Promise<Job<AkwamJobPayload>[]> {
    const prioritized = await this.queue.getJobs(['prioritized'], 0, -1, true);
    const waiting = await this.queue.getJobs(['waiting'], 0, -1, true);
    return [...prioritized, ...waiting];
  }

  async getQueueStatus(jobId: string): Promise<QueueStatusResult> {
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

  async getQueueMetrics(): Promise<QueueMetricsResult> {
    const counts = await this.queue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
      'prioritized',
    );
    return {
      waiting: (counts.waiting || 0) + (counts.prioritized || 0),
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      delayed: counts.delayed || 0,
    };
  }
}
