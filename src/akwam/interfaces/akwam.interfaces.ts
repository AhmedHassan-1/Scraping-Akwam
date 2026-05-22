export interface Episode {
  Title: string;
  [quality: string]: string; // e.g. "1080p": "link", "1080p_": "size"
}

export interface Movie {
  Title: string;
  Image: string;
  Rating: string;
  Lang: string;
  Quality: string;
  Year: string;
  Country: string;
  Time: string;
  Information: string[];
  [quality: string]: string | string[]; // download links + sizes
}

export interface Series {
  Title: string;
  Image: string;
  Rating: string;
  Lang: string;
  Quality: string;
  Year: string;
  Country: string;
  Time: string;
  Information: string[];
  [seriesTitle: string]: Episode[] | string | string[];
}

export interface SearchResult {
  Movies?: ['Movies', ...Movie[]];
  Series?: ['Series', ...Series[]];
}
