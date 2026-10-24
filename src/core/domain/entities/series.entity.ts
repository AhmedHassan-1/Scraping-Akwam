import { Episode } from './episode.entity';

export interface Series {
  title: string;
  image: string;
  rating: string;
  language: string;
  quality: string;
  year: string;
  country: string;
  duration: string;
  information: string[];
  episodes: Episode[];
}
