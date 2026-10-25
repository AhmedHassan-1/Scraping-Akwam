import { Injectable } from '@nestjs/common';
import { Movie } from '../../core/domain/entities/movie.entity';
import { Series } from '../../core/domain/entities/series.entity';

@Injectable()
export class LegacyResponseFormatter {
  format(movies: Movie[], series: Series[]): any[] {
    const allFilms: any[] = ['Movies'];
    const allSeries: any[] = ['Series'];
    const final: any[][] = [];

    movies.forEach((m) => {
      const legacyMovie: any = {
        Title: m.title,
        Image: m.image,
        Rating: m.rating,
        Lang: m.language,
        Quality: m.quality,
        Year: m.year,
        Country: m.country,
        Time: m.duration,
        Information: m.information,
      };
      m.qualities.forEach((q) => {
        legacyMovie[q.quality] = q.downloadUrl;
        legacyMovie[`${q.quality}_`] = q.size;
        legacyMovie[`${q.quality}_watch`] = q.watchUrl || q.downloadUrl;
      });
      allFilms.push(legacyMovie);
    });

    series.forEach((s) => {
      const legacySeries: any = {
        Title: s.title,
        Image: s.image,
        Rating: s.rating,
        Lang: s.language,
        Quality: s.quality,
        Year: s.year,
        Country: s.country,
        Time: s.duration,
        Information: s.information,
      };

      const episodesList: any[] = s.episodes.map((ep) => {
        const legacyEp: any = { Title: ep.title };
        ep.qualities.forEach((q) => {
          legacyEp[q.quality] = q.downloadUrl;
          legacyEp[`${q.quality}_`] = q.size;
          legacyEp[`${q.quality}_watch`] = q.watchUrl || q.downloadUrl;
        });
        return legacyEp;
      });

      legacySeries[s.title] = episodesList;
      legacySeries.episodes = episodesList;
      allSeries.push(legacySeries);
    });

    if (allFilms.length >= 2 && allSeries.length >= 2) {
      final.push(allFilms);
      final.push(allSeries);
    } else if (allFilms.length >= 2) {
      final.push(allFilms);
    } else if (allSeries.length >= 2) {
      final.push(allSeries);
    }

    return final;
  }
}
