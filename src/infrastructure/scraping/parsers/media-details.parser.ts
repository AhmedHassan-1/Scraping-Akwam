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

    // Movie parsing: dynamically locate the widget with download links
    const filmWidget = $('.widget')
      .filter((_, el) => $(el).find('a[href*="/download/"]').length > 0)
      .first();

    const qualityTabs = filmWidget.find('.header-tabs-container .header-tabs li, .header-tabs li');
    const qualityContents = filmWidget.find('.tab-content.quality, .tab-content');

    const qualities: DownloadQuality[] = [];

    if (qualityContents.length > 0) {
      qualityContents.each((i, qc) => {
        const tabEl = qualityTabs.eq(i);
        const qualityName =
          tabEl.find('a').text().trim() ||
          tabEl.text().trim() ||
          `Quality ${i + 1}`;
        const downloadLink = $(qc).find('a[href*="/download/"]').attr('href')?.trim();
        const watchLink = $(qc).find('a[href*="/watch/"]').attr('href')?.trim();
        const size = $(qc)
          .find('a[href*="/download/"]')
          .text()
          .replace(/تحميل/g, '')
          .trim();

        if (downloadLink) {
          qualities.push({
            quality: qualityName,
            downloadUrl: downloadLink,
            watchUrl: watchLink,
            size,
          });
        }
      });
    } else {
      filmWidget.find('a[href*="/download/"]').each((i, el) => {
        const dlLink = $(el).attr('href')?.trim();
        const size = $(el).text().replace(/تحميل/g, '').trim();
        if (dlLink) {
          qualities.push({
            quality: `Quality ${i + 1}`,
            downloadUrl: dlLink,
            size,
          });
        }
      });
    }

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
