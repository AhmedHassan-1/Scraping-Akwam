import * as cheerio from 'cheerio';
import { Episode } from '../../../core/domain/entities/episode.entity';
import { DownloadQuality } from '../../../core/domain/entities/download-quality.entity';

export class DownloadLinksParser {
  static parseEpisodeHeader(htmlBuffer: Buffer): string {
    const $ = cheerio.load(htmlBuffer);
    return $(
      '.site-container .page-movie.page-film .movie-cover.mb-4.without-cover .pr-lg-4 h1',
    )
      .text()
      .replace(/\s+/g, ' ')
      .trim();
  }

  static parseEpisodeQualities(htmlBuffer: Buffer): DownloadQuality[] {
    const $ = cheerio.load(htmlBuffer);
    const widgetBody = $(
      '.site-container .page-movie.page-film .container:nth-child(2) .widget-body',
    );
    const qualityTabs = widgetBody.find('.header-tabs-container .header-tabs li');
    const qualityContents = widgetBody.find('.bg-primary2.p-4 .tab-content.quality');

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

    return qualities;
  }

  static parseRedirectUrlFromDownloadPage(htmlBuffer: Buffer): string | null {
    const $ = cheerio.load(htmlBuffer);
    return (
      $('.site-container .page-download .content')
        .find('a.download-link')
        .first()
        .attr('href')
        ?.trim() ?? null
    );
  }

  static parseFinalDirectUrlFromRedirectPage(htmlBuffer: Buffer): string | null {
    const $ = cheerio.load(htmlBuffer);

    // Primary selector: link inside p.mt-5 inside the centered col
    const primary = $(
      '.site-container .page-redirect .container .row .col-lg-9 p.mt-5 a',
    )
      .first()
      .attr('href')
      ?.trim();

    if (primary) return primary;

    // Fallback: older selector pattern
    const fallback = $(
      '.site-container .page-redirect .container .row .mx-auto .my-5 .btn-loader a.link',
    )
      .attr('href')
      ?.trim();

    if (fallback) return fallback;

    // Last resort: any anchor inside .page-redirect that has a real http URL
    let lastResort: string | null = null;
    $('.site-container .page-redirect a').each((_, el) => {
      const href = $(el).attr('href')?.trim();
      if (href?.startsWith('http') && !href.includes('ak.sv')) {
        lastResort = href;
        return false; // break
      }
    });

    return lastResort;
  }
}
