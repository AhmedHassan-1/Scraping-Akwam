import * as cheerio from 'cheerio';
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
    const qualities: DownloadQuality[] = [];

    // Find the widget containing download links
    const widget = $('.widget')
      .filter((_, el) => $(el).find('a[href*="/download/"]').length > 0)
      .first();

    if (widget.length) {
      const tabs = widget.find('.header-tabs li');
      const contents = widget.find('.tab-content.quality, .tab-content');

      if (contents.length > 0) {
        contents.each((i, el) => {
          const qualityName = $(tabs.eq(i)).text().trim() || `Quality ${i + 1}`;
          const dlLink = $(el).find('a[href*="/download/"]').attr('href')?.trim();
          const watchLink = $(el).find('a[href*="/watch/"]').attr('href')?.trim();
          const size = $(el)
            .find('a[href*="/download/"]')
            .text()
            .replace(/تحميل/g, '')
            .trim();

          if (dlLink) {
            qualities.push({
              quality: qualityName,
              downloadUrl: dlLink,
              watchUrl: watchLink,
              size,
            });
          }
        });
      } else {
        // Fallback: direct download anchors
        widget.find('a[href*="/download/"]').each((i, el) => {
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
    }

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

  /**
   * Extracts the direct downloadable file link (e.g. https://s...downet.net/download/...)
   * from the Akwam redirect/download page.
   */
  static parseFinalDirectUrlFromRedirectPage(htmlBuffer: Buffer): string | null {
    const html = htmlBuffer.toString('utf8');
    const $ = cheerio.load(html);

    // 1. Selector from user's DevTools screenshot:
    // .page-redirect .container .row .col-lg-9 .btn-loader a.link.btn.btn-light
    const userImgSelector = $(
      '.page-redirect .btn-loader a.link.btn.btn-light, .btn-loader a.link.btn.btn-light',
    ).attr('href')?.trim();
    if (userImgSelector && (userImgSelector.includes('downet.net') || userImgSelector.includes('/download/'))) {
      return userImgSelector;
    }

    // 2. Specific a.link.btn inside .btn-loader or .page-redirect
    const btnLoaderLink = $(
      'a.link.btn.btn-light, .btn-loader a.link, a.link.btn, .page-redirect a.btn-light',
    ).attr('href')?.trim();
    if (btnLoaderLink && (btnLoaderLink.includes('downet.net') || btnLoaderLink.includes('/download/'))) {
      return btnLoaderLink;
    }

    // 3. Any anchor explicitly pointing to a Downet / media download server
    let downetAnchor: string | null = null;
    $('a[href*="downet.net/download/"], a[href*="/download/"]').each((_, el) => {
      const h = $(el).attr('href')?.trim();
      if (h && (h.includes('.downet.net/download/') || h.endsWith('.mp4') || h.endsWith('.mkv'))) {
        downetAnchor = h;
        return false;
      }
    });
    if (downetAnchor) return downetAnchor;

    // 4. Regex inside script tags (timer countdown on Akwam redirect page):
    // setTimeout(function () { $('a.download').attr('href', 'https://s...downet.net/download/...mp4'); }, 2200);
    const scriptRegex = /https?:\/\/[a-zA-Z0-9.-]+\.downet\.net\/download\/[^\s"'<>;)]+/g;
    const match = html.match(scriptRegex);
    if (match && match.length > 0) {
      return match[0].trim();
    }

    // 5. Older selector fallbacks
    const olderPrimary = $(
      '.site-container .page-redirect .container .row .col-lg-9 p.mt-5 a',
    ).first().attr('href')?.trim();
    if (olderPrimary) return olderPrimary;

    // 6. Last resort: any non-ak.sv external link
    let lastResort: string | null = null;
    $('.site-container .page-redirect a').each((_, el) => {
      const href = $(el).attr('href')?.trim();
      if (href?.startsWith('http') && !href.includes('ak.sv') && !href.includes('akwam.')) {
        lastResort = href;
        return false;
      }
    });

    return lastResort;
  }
}
