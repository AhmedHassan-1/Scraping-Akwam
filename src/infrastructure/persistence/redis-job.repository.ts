import { Injectable, Logger } from '@nestjs/common';
import { JobSnapshot, JobEvent } from '../../core/domain/entities/job.entity';
import { IJobRepository } from '../../core/interfaces/job-repository.interface';
import { RedisService } from '../../redis/redis.service';
import { Observable, ReplaySubject } from 'rxjs';

@Injectable()
export class RedisJobRepository implements IJobRepository {
  private readonly logger = new Logger(RedisJobRepository.name);
  private readonly prefix = 'job:snapshot:';
  private readonly eventChannelPrefix = 'job:events:';
  private readonly ttlSeconds = 7200; // 2 hours TTL

  // ReplaySubject per job buffers the latest 10 events so clients subscribing late do not miss events
  private readonly localSubjects = new Map<string, ReplaySubject<JobEvent>>();

  constructor(private readonly redis: RedisService) {}

  async save(job: JobSnapshot): Promise<void> {
    const key = `${this.prefix}${job.id}`;
    await this.redis.client.set(key, JSON.stringify(job), 'EX', this.ttlSeconds);
  }

  async findById(id: string): Promise<JobSnapshot | null> {
    const key = `${this.prefix}${id}`;
    const raw = await this.redis.client.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as JobSnapshot;
    } catch {
      return null;
    }
  }

  async delete(id: string): Promise<void> {
    const key = `${this.prefix}${id}`;
    await this.redis.client.del(key);
    this.localSubjects.get(id)?.complete();
    this.localSubjects.delete(id);
  }

  async update(id: string, partial: Partial<JobSnapshot>): Promise<JobSnapshot> {
    const job = await this.findById(id);
    if (!job) throw new Error(`Job ${id} not found in Redis`);

    const updatedJob: JobSnapshot = {
      ...job,
      ...partial,
      updatedAt: Date.now(),
    };

    await this.save(updatedJob);
    return updatedJob;
  }

  async publishEvent(jobId: string, event: JobEvent): Promise<void> {
    let subject = this.localSubjects.get(jobId);
    if (!subject) {
      subject = new ReplaySubject<JobEvent>(10);
      this.localSubjects.set(jobId, subject);
    }
    subject.next(event);

    if (['complete', 'cancelled', 'error'].includes(event.type)) {
      setTimeout(() => {
        subject?.complete();
        this.localSubjects.delete(jobId);
      }, 5000);
    }

    const channel = `${this.eventChannelPrefix}${jobId}`;
    await this.redis.client.publish(channel, JSON.stringify(event));
  }

  subscribeEvents(jobId: string): Observable<JobEvent> {
    let subject = this.localSubjects.get(jobId);
    if (!subject) {
      subject = new ReplaySubject<JobEvent>(10);
      this.localSubjects.set(jobId, subject);
    }
    return subject.asObservable();
  }
}
