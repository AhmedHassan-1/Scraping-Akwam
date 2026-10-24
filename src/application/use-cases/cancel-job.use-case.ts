import { Inject, Injectable } from '@nestjs/common';
import { JobSnapshot } from '../../core/domain/entities/job.entity';
import { JobNotFoundException } from '../../core/errors/domain.exception';
import { IJobRepository } from '../../core/interfaces/job-repository.interface';

@Injectable()
export class CancelJobUseCase {
  constructor(
    @Inject('IJobRepository')
    private readonly jobRepository: IJobRepository,
  ) {}

  async execute(id: string): Promise<JobSnapshot> {
    const job = await this.jobRepository.findById(id);
    if (!job) {
      throw new JobNotFoundException(id);
    }

    job.status = 'cancelled';
    job.queuePosition = 0;
    job.progress.message = 'تم إلغاء المهمة';
    job.updatedAt = Date.now();

    await this.jobRepository.save(job);
    await this.jobRepository.publishEvent(id, {
      type: 'cancelled',
      data: { status: job.status },
    });
    await this.jobRepository.publishEvent(id, {
      type: 'status',
      data: { status: job.status },
    });

    return job;
  }
}
