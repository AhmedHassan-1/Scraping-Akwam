import * as cheerio from 'cheerio';
import { SearchCandidate } from '../../../core/domain/entities/search-candidate.entity';

export class SearchPageParser {
  private static readonly siteOrigin = 'https://ak.sv';

  static parse(htmlBuffer: Buffer, origin?: string): SearchCandidate[] {
    const $ = cheerio.load(htmlBuffer);
    let searchItems = $(
      '.site-container .page-search .container:nth-child(2) .widget .widget-body.row.flex-wrap .col-lg-auto.col-md-4.col-6.mb-12',
    );
    if (!searchItems.length) {
      searchItems = $('.widget-body .entry-box');
    }
    if (!searchItems.length) {
      searchItems = $('.entry-box');
    }

    const candidates: SearchCandidate[] = [];
    let id = 0;

    for (const item of searchItems.toArray()) {
      const link =
        $(item).find('.entry-image a').attr('href') ||
        $(item).find('.entry-title a').attr('href');
      if (!link) continue;

      const title =
        $(item).find('.entry-title a').text().trim() ||
        $(item).find('.entry-title').text().trim() ||
        $(item).find('h3 a').text().trim() ||
        'بدون عنوان';

      const image = this.extractEntryImage($, item, origin);

      candidates.push({
        id: id++,
        title,
        image,
        url: this.resolveMediaUrl(link, origin),
      });
    }

    return candidates;
  }

  private static extractEntryImage($: cheerio.CheerioAPI, item: any, origin?: string): string {
    const entry = $(item).find('.entry-image').first();
    const imgEl = entry.find('img').first();

    const candidates: string[] = [
      imgEl.attr('data-src'),
      imgEl.attr('data-lazy-src'),
      imgEl.attr('data-original'),
      imgEl.attr('data-lazy-srcset'),
      imgEl.attr('data-srcset'),
      imgEl.attr('srcset'),
      imgEl.attr('src'),
    ]
      .filter(Boolean)
      .flatMap((v) => {
        if (v!.includes(',')) return [this.firstSrcFromSrcset(v)];
        return [v!];
      });

    entry.find('source').each((_, src) => {
      const srcset = $(src).attr('srcset');
      const srcAttr = $(src).attr('src');
      if (srcset) candidates.push(this.firstSrcFromSrcset(srcset));
      if (srcAttr) candidates.push(srcAttr);
    });

    const style = `${entry.attr('style') || ''} ${imgEl.attr('style') || ''}`;
    const bgMatch = style.match(/url\(\s*['"]?([^'")\s]+)['"]?\s*\)/i);
    if (bgMatch?.[1]) candidates.push(bgMatch[1]);

    for (const raw of candidates) {
      const resolved = this.resolveMediaUrl(raw, origin);
      if (resolved && !this.isPlaceholderImage(resolved)) return resolved;
    }
    return '';
  }

  private static resolveMediaUrl(url: string, origin?: string): string {
    if (!url?.trim()) return '';
    const trimmed = url.trim();
    if (trimmed.startsWith('data:')) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.startsWith('//')) return `https:${trimmed}`;
    const base = (origin || process.env.AKWAM_BASE_URL || this.siteOrigin).replace(/\/+$/, '');
    if (trimmed.startsWith('/')) return `${base}${trimmed}`;
    return `${base}/${trimmed}`;
  }

  private static isPlaceholderImage(url: string): boolean {
    const lower = url.toLowerCase();
    return (
      lower.includes('placeholder') ||
      lower.includes('1x1') ||
      lower.includes('blank.') ||
      lower.endsWith('.svg') ||
      /\/spacer[./]/i.test(lower)
    );
  }

  private static firstSrcFromSrcset(srcset?: string): string {
    if (!srcset) return '';
    const first = srcset.split(',')[0]?.trim().split(/\s+/)[0];
    return first || '';
  }
}
