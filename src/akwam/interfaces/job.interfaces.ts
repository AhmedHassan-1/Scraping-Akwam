import { Movie, Series } from './akwam.interfaces';

export type JobStatus =
  | 'queued'
  | 'discovering'
  | 'awaiting_selection'
  | 'processing'
  | 'completed'
  | 'cancelled'
  | 'failed';

export interface CreateJobOptions {
  /** Admin cookie bypass only — queue order is server-assigned */
  bypass?: boolean;
}

export interface SearchCandidate {
  id: number;
  title: string;
  image: string;
  url: string;
}

export interface ProgressState {
  phase: string;
  message: string;
  current: number;
  total: number;
  completedItems: number;
}

export interface JobEvent {
  type:
    | 'status'
    | 'candidates'
    | 'progress'
    | 'item'
    | 'complete'
    | 'error'
    | 'cancelled'
    | 'queue';
  data: unknown;
}

export interface JobSnapshot {
  id: string;
  search: string;
  status: JobStatus;
  candidates: SearchCandidate[];
  progress: ProgressState;
  results: object[];
  error?: string;
  /** Server-computed place in line (1 = next). 0 = running or not waiting. */
  queuePosition?: number;
  /** How many jobs are waiting in the queue right now */
  queueTotal?: number;
  /** Jobs ahead of this one in the queue */
  queueAhead?: number;
  /** Internal server priority snapshot (not user-editable) */
  priority?: number;
  bypassedQueue?: boolean;
}

export type ProcessedItem = Movie | Series;
