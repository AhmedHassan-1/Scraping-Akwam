/** Queue position returned by the server (1 = next to run among waiting jobs). */
export interface QueueStatus {
  /** 0 = running now or not in queue; 1+ = position in line */
  position: number;
  waitingTotal: number;
  ahead: number;
  isActive: boolean;
}
