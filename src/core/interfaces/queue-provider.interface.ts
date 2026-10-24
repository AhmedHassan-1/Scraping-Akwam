export interface QueueStatusResult {
  position: number;
  waitingTotal: number;
  ahead: number;
  isActive: boolean;
}

export interface IQueueProvider {
  addDiscoverJob(jobId: string, priority: number): Promise<void>;
  addProcessJob(jobId: string, selectedIds: number[], priority: number): Promise<void>;
  getQueueStatus(jobId: string): Promise<QueueStatusResult>;
  resolveUserPriority(bypass: boolean): number;
  toBullPriority(userPriority: number, bypass: boolean): number;
}
