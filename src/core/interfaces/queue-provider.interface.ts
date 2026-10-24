export interface QueueStatusResult {
  position: number;
  waitingTotal: number;
  ahead: number;
  isActive: boolean;
}

export interface QueueMetricsResult {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface IQueueProvider {
  addDiscoverJob(jobId: string, priority: number): Promise<void>;
  addProcessJob(jobId: string, selectedIds: number[], priority: number): Promise<void>;
  getQueueStatus(jobId: string): Promise<QueueStatusResult>;
  getQueueMetrics(): Promise<QueueMetricsResult>;
  resolveUserPriority(bypass: boolean): number;
  toBullPriority(userPriority: number, bypass: boolean): number;
}
