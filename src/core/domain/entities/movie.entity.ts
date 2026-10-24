import { DownloadQuality } from './download-quality.entity';

export interface Movie {
  title: string;
  image: string;
  rating: string;
  language: string;
  quality: string;
  year: string;
  country: string;
  duration: string;
  information: string[];
  qualities: DownloadQuality[];
}
