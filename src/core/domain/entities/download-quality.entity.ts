export interface DownloadQuality {
  quality: string;       // e.g. "1080p", "720p", "480p"
  downloadUrl: string;   // Direct resolved download link
  size: string;          // e.g. "1.4 GB"
  watchUrl?: string;     // Streaming/watch link if available
}
