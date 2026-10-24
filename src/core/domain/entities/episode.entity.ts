import { DownloadQuality } from './download-quality.entity';

export interface Episode {
  title: string;
  qualities: DownloadQuality[];
}
