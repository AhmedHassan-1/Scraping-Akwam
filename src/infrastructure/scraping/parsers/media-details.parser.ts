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
  static parse(
    htmlBuffer: Buffer,
    fallbackTitle: string,
    itemUrl?: string,
  ): ParsedMediaDetails {
    const $ = cheerio.load(htmlBuffer);

    const coverRow = $(
      '.page-movie.page-film .movie-cover.mb-4.without-cover .container .row.py-4',
    );
    const infoCol = coverRow.children().eq(1);
    const infoItems = infoCol.children('div');

    const title = infoCol.find('h1').text().trim() || fallbackTitle;
    const coverCol = coverRow.children().eq(0);
    const image =
      coverCol.find('a').attr('href') ||
      coverCol.find('img').attr('data-src') ||
      coverCol.find('img').attr('src') ||
      '';

    let rating = '';
    let lang = '';
    let translation = '';
    let quality = '';
    let country = '';
    let year = '';
    let time = '';
    const information: string[] = [];

    // Parse metadata dynamically by labels to withstand any order or language variation
    infoItems.each((_, el) => {
      const fullText = $(el).text().replace(/\s+/g, ' ').trim();
      const spanText = $(el).find('span').text().trim();
      const val = spanText || fullText;

      if (/اللغة/i.test(fullText)) {
        lang = val;
      } else if (/الترجمة/i.test(fullText)) {
        translation = val;
      } else if (/الجودة|جودة/i.test(fullText)) {
        quality = val;
      } else if (/انتاج|إنتاج/i.test(fullText)) {
        country = val;
      } else if (/السنة|سنة/i.test(fullText)) {
        year = val;
      } else if (/المدة|مدة/i.test(fullText)) {
        time = val;
      }
    });

    if (!rating) {
      rating =
        infoItems.eq(0).find('span').text().trim() ||
        infoItems.eq(0).text().replace(/\s+/g, ' ').trim();
    }

    // Extract genres and categories
    infoCol
      .find('a[href*="/genre/"], a[href*="/tag/"], a[href*="/category/"]')
      .each((_, a) => {
        const t = $(a).text().trim();
        if (t && !information.includes(t)) information.push(t);
      });

    if (information.length === 0) {
      // Fallback: collect trailing links in infoCol that are not main navigation
      infoCol.find('a').each((_, a) => {
        const href = $(a).attr('href') || '';
        const t = $(a).text().trim();
        if (
          t &&
          !href.includes('/movie') &&
          !href.includes('/series') &&
          !information.includes(t)
        ) {
          information.push(t);
        }
      });
    }

    // Robust multi-factor series detection
    const hasEpisodesSection =
      $('#series-episodes').length > 0 ||
      $('a[href*="/episode/"]').length > 0;
    const isSeriesUrl = Boolean(itemUrl && /\/series\//i.test(itemUrl));
    const isSeriesText = /مسلسل/i.test(time) || /مسلسل/i.test(title);
    const isSeries = hasEpisodesSection || isSeriesUrl || isSeriesText;

    if (isSeries) {
      const episodeUrls: string[] = [];

      // Collect distinct episode URLs from the episode listing
      const episodesContainer = $('#series-episodes');
      const searchScope = episodesContainer.length ? episodesContainer : $('body');

      searchScope.find('a[href*="/episode/"]').each((_, a) => {
        const epLink = $(a).attr('href')?.trim();
        if (epLink && !episodeUrls.includes(epLink)) {
          episodeUrls.push(epLink);
        }
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

    const qualityTabs = filmWidget.find(
      '.header-tabs-container .header-tabs li, .header-tabs li',
    );
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
