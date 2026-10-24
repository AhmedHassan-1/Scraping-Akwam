import { Inject, Injectable } from '@nestjs/common';
import { JobSnapshot } from '../../core/domain/entities/job.entity';
import { JobNotFoundException } from '../../core/errors/domain.exception';
import { IJobRepository } from '../../core/interfaces/job-repository.interface';
import { IQueueProvider } from '../../core/interfaces/queue-provider.interface';

@Injectable()
export class GetJobSnapshotUseCase {
  constructor(
    @Inject('IJobRepository')
    private readonly jobRepository: IJobRepository,
    @Inject('IQueueProvider')
    private readonly queueProvider: IQueueProvider,
  ) {}

  async execute(id: string): Promise<JobSnapshot> {
    const job = await this.jobRepository.findById(id);
    if (!job) {
      throw new JobNotFoundException(id);
    }

    if (job.status === 'queued') {
      const qStatus = await this.queueProvider.getQueueStatus(id);
      job.queuePosition = qStatus.position;
      job.queueTotal = qStatus.waitingTotal;
      job.queueAhead = qStatus.ahead;
      await this.jobRepository.save(job);
    }

    return job;
  }
}
