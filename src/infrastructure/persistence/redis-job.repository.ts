import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { Observable, ReplaySubject } from 'rxjs';
import { JobSnapshot, JobEvent } from '../../core/domain/entities/job.entity';
import { IJobRepository } from '../../core/interfaces/job-repository.interface';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class RedisJobRepository
  implements IJobRepository, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RedisJobRepository.name);
  private readonly instanceId = randomUUID();
  private readonly prefix = 'job:snapshot:';
  private readonly eventChannelPrefix = 'job:events:';
  private readonly ttlSeconds = 7200; // 2 hours TTL

  // ReplaySubject per job buffers the latest 10 events so clients subscribing late do not miss events
  private readonly localSubjects = new Map<string, ReplaySubject<JobEvent>>();
  private readonly subscribedJobIds = new Set<string>();
  private subscriber!: Redis;

  constructor(private readonly redis: RedisService) {}

  onModuleInit() {
    this.subscriber = this.redis.client.duplicate();

    this.subscriber.on('connect', () => {
      this.logger.log('Redis Event Subscriber connected');
    });

    this.subscriber.on('message', (channel: string, message: string) => {
      if (!channel.startsWith(this.eventChannelPrefix)) return;
      const jobId = channel.slice(this.eventChannelPrefix.length);

      try {
        const payload = JSON.parse(message);
        // Ignore events broadcasted by this same instance to prevent duplicate emissions
        if (payload._src === this.instanceId) return;

        const event: JobEvent = {
          type: payload.type,
          data: payload.data,
        };

        const subject = this.localSubjects.get(jobId);
        if (subject) {
          subject.next(event);
        }

        if (['complete', 'cancelled', 'error'].includes(event.type)) {
          setTimeout(() => {
            this.cleanupJobSubscription(jobId);
          }, 5000);
        }
      } catch (err: any) {
        this.logger.error(
          `Failed to process cross-instance Redis event for job ${jobId}: ${err.message}`,
        );
      }
    });

    // Periodic sweep every 15 minutes to prevent memory leaks from abandoned jobs
    setInterval(() => {
      this.sweepStaleSubjects();
    }, 15 * 60 * 1000).unref();
  }

  async onModuleDestroy() {
    try {
      await this.subscriber?.quit();
    } catch (_) {}
  }

  async save(job: JobSnapshot): Promise<void> {
    const key = `${this.prefix}${job.id}`;
    await this.redis.client.set(
      key,
      JSON.stringify(job),
      'EX',
      this.ttlSeconds,
    );
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
    this.cleanupJobSubscription(id);
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
        this.cleanupJobSubscription(jobId);
      }, 5000);
    }

    const channel = `${this.eventChannelPrefix}${jobId}`;
    const payload = JSON.stringify({
      ...event,
      _src: this.instanceId,
    });

    await this.redis.client.publish(channel, payload);
  }

  subscribeEvents(jobId: string): Observable<JobEvent> {
    let subject = this.localSubjects.get(jobId);
    if (!subject) {
      subject = new ReplaySubject<JobEvent>(10);
      this.localSubjects.set(jobId, subject);
    }

    // Subscribe to Redis pub/sub channel for cross-instance propagation
    if (this.subscriber && !this.subscribedJobIds.has(jobId)) {
      this.subscribedJobIds.add(jobId);
      const channel = `${this.eventChannelPrefix}${jobId}`;
      this.subscriber.subscribe(channel).catch((err: any) => {
        this.logger.warn(
          `Failed to subscribe to Redis channel ${channel}: ${err.message}`,
        );
      });
    }

    return subject.asObservable();
  }

  private cleanupJobSubscription(jobId: string): void {
    const channel = `${this.eventChannelPrefix}${jobId}`;
    if (this.subscriber && this.subscribedJobIds.has(jobId)) {
      this.subscribedJobIds.delete(jobId);
      this.subscriber.unsubscribe(channel).catch(() => {});
    }

    const subject = this.localSubjects.get(jobId);
    if (subject) {
      subject.complete();
      this.localSubjects.delete(jobId);
    }
  }

  private async sweepStaleSubjects(): Promise<void> {
    for (const [jobId, subject] of this.localSubjects.entries()) {
      try {
        const job = await this.findById(jobId);
        // Clean up if job was deleted, or finished more than 10 minutes ago
        if (
          !job ||
          ['completed', 'cancelled', 'failed'].includes(job.status)
        ) {
          this.cleanupJobSubscription(jobId);
        }
      } catch {
        // ignore sweep errors
      }
    }
  }
}
