import * as cheerio from 'cheerio';
import { Movie } from '../../../core/domain/entities/movie.entity';
import { Series } from '../../../core/domain/entities/series.entity';
import { DownloadQuality } from '../../../core/domain/entities/download-quality.entity';

export interface ParsedMediaDetails {
  isSeries: boolean;
  movie?: Movie;
  series?: Series;
  episodeUrls?: string[];
}

export class MediaDetailsParser {
  static parse(htmlBuffer: Buffer, fallbackTitle: string): ParsedMediaDetails {
    const $ = cheerio.load(htmlBuffer);

    const coverRow = $(
      '.page-movie.page-film .movie-cover.mb-4.without-cover .container .row.py-4',
    );
    const infoCol = coverRow.children().eq(1);
    const infoItems = infoCol.children('div');

    const title = infoCol.find('h1').text().trim() || fallbackTitle;
    const rating = infoItems.eq(0).find('span').text().trim();
    const lang = infoItems.eq(1).find('span').text().trim();
    const image = coverRow.children().eq(0).find('a').attr('href') ?? '';

    const isEnglish = lang === 'اللغة : الإنجليزية';
    const offset = isEnglish ? 1 : 0;

    const quality = infoItems.eq(2 + offset).find('span').text().trim();
    const country = infoItems.eq(3 + offset).find('span').text().trim();
    const year = infoItems.eq(4 + offset).find('span').text().trim();
    const time = infoItems.eq(5 + offset).find('span').text().trim();
    const infoLinks = infoItems.eq(6 + offset).find('a').toArray();
    const information = infoLinks.map((a) => $(a).text().trim());

    const isSeries = /مسلسل/.test(time);

    if (isSeries) {
      const containers = $('.page-movie.page-film .container');
      let episodesEl = containers
        .eq(1)
        .find('#series-episodes .widget-body .bg-primary2.p-4.col-lg-4.col-md-6.col-12');
      if (!episodesEl.length) {
        episodesEl = containers
          .eq(1)
          .find('#series-episodes')
          .last()
          .find('.widget-body .row .bg-primary2.p-4.col-lg-4.col-md-6.col-12');
      }

      const episodeUrls: string[] = [];
      episodesEl.each((_, ep) => {
        const epLink = $(ep).find('h2 a').attr('href');
        if (epLink) episodeUrls.push(epLink);
      });

      const series: Series = {
        title,
        image,
        rating,
        language: lang,
        quality,
        year,
        country,
        duration: time,
        information,
        episodes: [],
      };

      return { isSeries: true, series, episodeUrls };
    }

    // Movie parsing
    const containers = $('.page-movie.page-film .container');
    let filmWidget: cheerio.Cheerio<any>;

    try {
      filmWidget = containers
        .eq(1)
        .find('.widget.widget-style-1.mb-5')
        .eq(2)
        .find('.widget-body');
      if (!filmWidget.find('.bg-primary2.p-4').length) throw new Error();
    } catch (_) {
      filmWidget = containers
        .eq(1)
        .find('.widget.widget-style-1.mb-5')
        .eq(3)
        .find('.widget-body');
    }

    const qualityTabs = filmWidget.find('.header-tabs-container .header-tabs li');
    const qualityContents = filmWidget.find('.bg-primary2.p-4 .tab-content.quality');

    const qualities: DownloadQuality[] = [];

    qualityContents.each((i, qc) => {
      const qualityName = $(qualityTabs.eq(i)).find('a').text().trim();
      const linkDiv = $(qc)
        .find('.qualities.row.flex-wrap.align-items-center .col-lg-6.row')
        .children()
        .eq(1);
      const downloadLink = linkDiv.find('a').attr('href');
      const size = linkDiv.find('a span').eq(1).text().trim();

      if (downloadLink) {
        qualities.push({
          quality: qualityName,
          downloadUrl: downloadLink,
          size,
        });
      }
    });

    const movie: Movie = {
      title,
      image,
      rating,
      language: lang,
      quality,
      year,
      country,
      duration: time,
      information,
      qualities,
    };

    return { isSeries: false, movie };
  }
}
