import { JobSnapshot, JobEvent } from '../domain/entities/job.entity';
import { Observable } from 'rxjs';

export interface IJobRepository {
  save(job: JobSnapshot): Promise<void>;
  findById(id: string): Promise<JobSnapshot | null>;
  delete(id: string): Promise<void>;
  update(id: string, partial: Partial<JobSnapshot>): Promise<JobSnapshot>;
  publishEvent(jobId: string, event: JobEvent): Promise<void>;
  subscribeEvents(jobId: string): Observable<JobEvent>;
}
