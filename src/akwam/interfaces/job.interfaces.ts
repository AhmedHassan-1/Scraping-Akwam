import { Movie, Series } from './akwam.interfaces';

export type JobStatus =
  | 'discovering'
  | 'awaiting_selection'
  | 'processing'
  | 'completed'
  | 'cancelled'
  | 'failed';

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
    | 'cancelled';
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
}

export type ProcessedItem = Movie | Series;
