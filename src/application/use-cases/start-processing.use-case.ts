import { Inject, Injectable } from '@nestjs/common';
import { JobSnapshot } from '../../core/domain/entities/job.entity';
import { JobNotFoundException, JobInvalidStateException } from '../../core/errors/domain.exception';
import { IJobRepository } from '../../core/interfaces/job-repository.interface';
import { IQueueProvider } from '../../core/interfaces/queue-provider.interface';
import { CreateJobOptions } from './create-job.use-case';

@Injectable()
export class StartProcessingUseCase {
  constructor(
    @Inject('IJobRepository')
    private readonly jobRepository: IJobRepository,
    @Inject('IQueueProvider')
    private readonly queueProvider: IQueueProvider,
  ) {}

  async execute(
    id: string,
    selectedIds: number[],
    options: CreateJobOptions = {},
  ): Promise<JobSnapshot> {
    const job = await this.jobRepository.findById(id);
    if (!job) {
      throw new JobNotFoundException(id);
    }

    if (job.status !== 'awaiting_selection') {
      throw new JobInvalidStateException('لا يمكن بدء المعالجة في هذه الحالة');
    }

    if (!selectedIds?.length) {
      throw new JobInvalidStateException('يجب اختيار عنصر واحد على الأقل');
    }

    const selectedCandidates = job.candidates.filter((c) => selectedIds.includes(c.id));
    if (!selectedCandidates.length) {
      throw new JobInvalidStateException('لم يتم العثور على العناصر المحددة في القائمة المكتشفة');
    }

    const bypass = options.bypass ?? job.bypassedQueue;
    const priority = this.queueProvider.resolveUserPriority(bypass);
    const bullPriority = this.queueProvider.toBullPriority(priority, bypass);

    job.priority = priority;
    job.selectedIds = selectedIds;
    job.status = 'queued';
    job.progress.phase = 'queue';
    job.progress.message = 'في انتظار الدور لبدء المعالجة...';
    job.updatedAt = Date.now();

    await this.jobRepository.save(job);
    await this.jobRepository.publishEvent(id, { type: 'status', data: { status: job.status } });

    await this.queueProvider.addProcessJob(id, selectedIds, bullPriority);

    const qStatus = await this.queueProvider.getQueueStatus(id);
    job.queuePosition = qStatus.position;
    job.queueTotal = qStatus.waitingTotal;
    job.queueAhead = qStatus.ahead;
    await this.jobRepository.save(job);

    return job;
  }
}
