import { Movie } from './movie.entity';
import { Series } from './series.entity';
import { SearchCandidate } from './search-candidate.entity';

export type JobStatus =
  | 'queued'
  | 'discovering'
  | 'awaiting_selection'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface ProgressState {
  phase: 'queue' | 'discover' | 'item' | 'detail' | 'item_done';
  message: string;
  current: number;
  total: number;
  completedItems?: number;
}

export interface JobSnapshot {
  id: string;
  search: string;
  status: JobStatus;
  candidates: SearchCandidate[];
  selectedIds: number[];
  progress: ProgressState;
  movies: Movie[];
  series: Series[];
  results: any[];
  error?: string;
  queuePosition: number;
  queueTotal: number;
  queueAhead: number;
  priority: number;
  bypassedQueue: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface JobEvent {
  type: 'status' | 'progress' | 'candidates' | 'item' | 'complete' | 'error' | 'cancelled' | 'queue';
  data: any;
}
