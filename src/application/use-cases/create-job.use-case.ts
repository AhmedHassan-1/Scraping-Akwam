import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { JobSnapshot } from '../../core/domain/entities/job.entity';
import { IJobRepository } from '../../core/interfaces/job-repository.interface';
import { IQueueProvider } from '../../core/interfaces/queue-provider.interface';
import { ConfigService } from '@nestjs/config';

export interface CreateJobOptions {
  bypass?: boolean;
}

@Injectable()
export class CreateJobUseCase {
  constructor(
    @Inject('IJobRepository')
    private readonly jobRepository: IJobRepository,
    @Inject('IQueueProvider')
    private readonly queueProvider: IQueueProvider,
    private readonly config: ConfigService,
  ) {}

  async execute(search: string, options: CreateJobOptions = {}): Promise<JobSnapshot> {
    const id = randomUUID();
    const bypass = !!options.bypass;
    const priority = this.queueProvider.resolveUserPriority(bypass);
    const bullPriority = this.queueProvider.toBullPriority(priority, bypass);
    const now = Date.now();

    const job: JobSnapshot = {
      id,
      search,
      status: 'queued',
      candidates: [],
      selectedIds: [],
      progress: {
        phase: 'queue',
        message: 'جاري تسجيل طلبك في الطابور...',
        current: 0,
        total: 0,
        completedItems: 0,
      },
      movies: [],
      series: [],
      results: [],
      priority,
      bypassedQueue: bypass,
      queuePosition: 0,
      queueTotal: 0,
      queueAhead: 0,
      createdAt: now,
      updatedAt: now,
    };

    await this.jobRepository.save(job);
    await this.jobRepository.publishEvent(id, { type: 'status', data: { status: job.status } });

    await this.queueProvider.addDiscoverJob(id, bullPriority);

    const qStatus = await this.queueProvider.getQueueStatus(id);
    job.queuePosition = qStatus.position;
    job.queueTotal = qStatus.waitingTotal;
    job.queueAhead = qStatus.ahead;
    await this.jobRepository.save(job);

    return job;
  }
}
