import { Injectable } from "@nestjs/common";
import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import { ScrapeRateLimiterService } from "../queue/scrape-rate-limiter.service";
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { Movie, Series, Episode } from "./interfaces/akwam.interfaces";
import {
  ProgressState,
  SearchCandidate,
  ProcessedItem,
} from "./interfaces/job.interfaces";

export type ProgressCallback = (progress: Partial<ProgressState>) => void;

@Injectable()
export class AkwamService {
  private readonly siteOrigin = "https://ak.sv";

  constructor(private readonly scrapeLimiter: ScrapeRateLimiterService) {}

  private readonly headers = {
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
    "content-type": "text/html; charset=UTF-8",
    "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    charset: "utf-8",
  };

  /** @deprecated Use job-based discover + process flow */
  async getResults(search: string): Promise<object[]> {
    const candidates = await this.discoverCandidates(search);
    const items = await this.processCandidates(candidates, undefined, () => {});
    return this.buildFinalResponse(items.movies, items.series);
  }

  async discoverCandidates(
    search: string,
    signal?: AbortSignal,
    onProgress?: ProgressCallback,
  ): Promise<SearchCandidate[]> {
    onProgress?.({
      phase: "discover",
      message: "جاري البحث في الموقع...",
      current: 0,
      total: 1,
    });

    const searchRes = await this.scrapeGet(`https://ak.sv/search?q=${search}`, {
      headers: this.headers,
      responseType: "arraybuffer",
      signal,
    });
    const $ = cheerio.load(Buffer.from(searchRes.data));

    const searchItems = $(
      ".site-container .page-search .container:nth-child(2) .widget .widget-body.row.flex-wrap .col-lg-auto.col-md-4.col-6.mb-12",
    );

    const candidates: SearchCandidate[] = [];
    let id = 0;

    for (const item of searchItems.toArray()) {
      const link = $(item).find(".entry-image a").attr("href");
      if (!link) continue;

      const title =
        $(item).find(".entry-title a").text().trim() ||
        $(item).find(".entry-title").text().trim() ||
        $(item).find("h3 a").text().trim() ||
        "بدون عنوان";

      const image = this.extractEntryImage($, item);

      candidates.push({
        id: id++,
        title,
        image,
        url: this.resolveMediaUrl(link),
      });
    }

    onProgress?.({
      phase: "discover",
      message: `تم العثور على ${candidates.length} نتيجة`,
      current: 1,
      total: 1,
    });

    return candidates;
  }

  async processCandidates(
    candidates: SearchCandidate[],
    signal?: AbortSignal,
    onProgress?: ProgressCallback,
    onItemComplete?: (item: ProcessedItem, kind: "movie" | "series") => void,
  ): Promise<{ movies: Movie[]; series: Series[] }> {
    const movies: Movie[] = [];
    const series: Series[] = [];
    const total = candidates.length;

    for (let i = 0; i < candidates.length; i++) {
      if (signal?.aborted) break;

      const candidate = candidates[i];
      onProgress?.({
        phase: "item",
        message: `جاري معالجة: ${candidate.title}`,
        current: i + 1,
        total,
        completedItems: movies.length + series.length,
      });

      const item = await this.processItem(
        candidate.url,
        candidate.title,
        signal,
        (msg, subCurrent, subTotal) => {
          onProgress?.({
            phase: "detail",
            message: `${candidate.title}: ${msg}`,
            current: i + 1,
            total,
            completedItems: movies.length + series.length,
          });
        },
      );

      if (!item) continue;
      if ("episodes" in item && item.series) {
        series.push(item.series);
        onItemComplete?.(item.series, "series");
        onProgress?.({
          phase: "item_done",
          message: `اكتمل المسلسل: ${candidate.title}`,
          current: i + 1,
          total,
          completedItems: movies.length + series.length,
        });
      } else if (item.movie) {
        movies.push(item.movie);
        onItemComplete?.(item.movie, "movie");
        onProgress?.({
          phase: "item_done",
          message: `اكتمل الفيلم: ${candidate.title}`,
          current: i + 1,
          total,
          completedItems: movies.length + series.length,
        });
      }
    }

    return { movies, series };
  }

  buildFinalResponse(movies: Movie[], series: Series[]): object[] {
    const allFilms: (string | Movie)[] = ["Movies"];
    const allSeries: (string | Series)[] = ["Series"];
    const final: (string | Movie | Series)[][] = [];

    movies.forEach((m) => allFilms.push(m));
    series.forEach((s) => allSeries.push(s));

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

  formatPartialResults(movies: Movie[], series: Series[]): object[] {
    return this.buildFinalResponse(movies, series);
  }

  private async processItem(
    link: string,
    fallbackTitle: string,
    signal?: AbortSignal,
    onDetailProgress?: (
      message: string,
      subCurrent?: number,
      subTotal?: number,
    ) => void,
  ): Promise<{ movie?: Movie; series?: Series; episodes?: boolean } | null> {
    const itemRes = await this.scrapeGet(link, {
      headers: this.headers,
      responseType: "arraybuffer",
      signal,
    });
    const $p = cheerio.load(Buffer.from(itemRes.data));

    const coverRow = $p(
      ".page-movie.page-film .movie-cover.mb-4.without-cover .container .row.py-4",
    );
    const infoCol = coverRow.children().eq(1);
    const infoItems = infoCol.children("div");

    const title = infoCol.find("h1").text().trim() || fallbackTitle;
    const rating = infoItems.eq(0).find("span").text().trim();
    const lang = infoItems.eq(1).find("span").text().trim();
    const image = coverRow.children().eq(0).find("a").attr("href") ?? "";

    const isEnglish = lang === "اللغة : الإنجليزية";
    const offset = isEnglish ? 1 : 0;

    const quality = infoItems
      .eq(2 + offset)
      .find("span")
      .text()
      .trim();
    const country = infoItems
      .eq(3 + offset)
      .find("span")
      .text()
      .trim();
    const year = infoItems
      .eq(4 + offset)
      .find("span")
      .text()
      .trim();
    const time = infoItems
      .eq(5 + offset)
      .find("span")
      .text()
      .trim();
    const infoLinks = infoItems
      .eq(6 + offset)
      .find("a")
      .toArray();
    const information = infoLinks.map((a) => $p(a).text().trim());

    const isSeries = /مسلسل/.test(time);

    if (isSeries) {
      const series: Series = {
        Title: title,
        Image: image,
        Rating: rating,
        Lang: lang,
        Quality: quality,
        Year: year,
        Country: country,
        Time: time,
        Information: information,
      };

      const containers = $p(".page-movie.page-film .container");
      let episodesEl = containers
        .eq(1)
        .find(
          "#series-episodes .widget-body .bg-primary2.p-4.col-lg-4.col-md-6.col-12",
        );
      if (!episodesEl.length) {
        episodesEl = containers
          .eq(1)
          .find("#series-episodes")
          .last()
          .find(".widget-body .row .bg-primary2.p-4.col-lg-4.col-md-6.col-12");
      }

      const episodesList: Episode[] = [];
      const episodeEls = episodesEl.toArray();
      const epTotal = episodeEls.length;

      for (let epIdx = 0; epIdx < episodeEls.length; epIdx++) {
        if (signal?.aborted) break;

        const ep = episodeEls[epIdx];
        const epLink = $p(ep).find("h2 a").attr("href");
        if (!epLink) continue;

        onDetailProgress?.(
          `الحلقة ${epIdx + 1} من ${epTotal}`,
          epIdx + 1,
          epTotal,
        );

        const epRes = await this.scrapeGet(epLink, {
          headers: this.headers,
          responseType: "arraybuffer",
          signal,
        });
        const $e = cheerio.load(Buffer.from(epRes.data));
        const epTitle = $e(
          ".site-container .page-movie.page-film .movie-cover.mb-4.without-cover .pr-lg-4 h1 ",
        )
          .text()
          .replace(/\s+/g, " ")
          .trim();

        const widgetBody = $e(
          ".site-container .page-movie.page-film .container:nth-child(2) .widget-body",
        );
        const qualityTabs = widgetBody.find(
          ".header-tabs-container .header-tabs li",
        );
        const qualityContents = widgetBody.find(
          ".bg-primary2.p-4 .tab-content.quality",
        );

        const episode: Episode = { Title: epTitle };
        qualityContents.each((i, qc) => {
          const qualityName = $e(qualityTabs.eq(i)).find("a").text().trim();
          const linkDiv = $e(qc)
            .find(".qualities.row.flex-wrap.align-items-center .col-lg-6.row")
            .children()
            .eq(1);
          const downloadLink = linkDiv.find("a").attr("href");
          const size = linkDiv.find("a span").eq(1).text().trim();

          if (downloadLink) {
            episode[qualityName] = downloadLink;
            episode[`${qualityName}_`] = size;
          }
        });

        await this.resolveDownloadLinks(episode, signal, (qName) => {
          onDetailProgress?.(
            `الحلقة ${epIdx + 1}: جودة ${qName}`,
            epIdx + 1,
            epTotal,
          );
        });

        episodesList.push(episode);
      }

      series[title] = episodesList;
      return { series, episodes: true };
    }

    onDetailProgress?.("جاري جلب روابط التحميل...");

    const containers = $p(".page-movie.page-film .container");
    let filmWidget: cheerio.Cheerio<any>;

    try {
      filmWidget = containers
        .eq(1)
        .find(".widget.widget-style-1.mb-5")
        .eq(2)
        .find(".widget-body");
      if (!filmWidget.find(".bg-primary2.p-4").length) throw new Error();
    } catch (_) {
      filmWidget = containers
        .eq(1)
        .find(".widget.widget-style-1.mb-5")
        .eq(3)
        .find(".widget-body");
    }

    const qualityTabs = filmWidget.find(
      ".header-tabs-container .header-tabs li",
    );
    const qualityContents = filmWidget.find(
      ".bg-primary2.p-4 .tab-content.quality",
    );

    const movie: Movie = {
      Title: title,
      Image: image,
      Rating: rating,
      Lang: lang,
      Quality: quality,
      Year: year,
      Country: country,
      Time: time,
      Information: information,
    };

    qualityContents.each((i, qc) => {
      const qualityName = $p(qualityTabs.eq(i)).find("a").text().trim();
      const linkDiv = $p(qc)
        .find(".qualities.row.flex-wrap.align-items-center .col-lg-6.row")
        .children()
        .eq(1);
      const downloadLink = linkDiv.find("a").attr("href");
      const size = linkDiv.find("a span").eq(1).text().trim();

      if (downloadLink) {
        movie[qualityName] = downloadLink;
        movie[`${qualityName}_`] = size;
      }
    });

    await this.resolveDownloadLinks(movie, signal, (qName) => {
      onDetailProgress?.(`جودة ${qName}`);
    });

    return { movie };
  }

  private async resolveDownloadLinks(
    target: Movie | Episode,
    signal?: AbortSignal,
    onQuality?: (qualityName: string) => void,
  ): Promise<void> {
    const skipKeys = new Set([
      "Title",
      "Image",
      "Rating",
      "Lang",
      "Quality",
      "Year",
      "Country",
      "Time",
      "Information",
    ]);

    for (const key of Object.keys(target)) {
      if (skipKeys.has(key) || key.endsWith("_")) continue;
      const dlLink = target[key] as string;
      if (!dlLink?.startsWith("http")) continue;

      onQuality?.(key);

      try {
        // ── الخطوة الأولى: صفحة التحميل ──────────────────────────────────
        const dlRes = await this.scrapeGet(dlLink, {
          headers: this.headers,
          responseType: "arraybuffer",
          signal,
        });
        const $d = cheerio.load(Buffer.from(dlRes.data));

        const redirectPageUrl = $d(".site-container .page-download .content")
          .find("a.download-link")
          .first()
          .attr("href")
          ?.trim();

        if (!redirectPageUrl) continue;

        // ── الخطوة الثانية: صفحة الـ redirect ────────────────────────────
        const redirectRes = await this.scrapeGet(redirectPageUrl, {
          headers: this.headers,
          responseType: "arraybuffer",
          signal,
        });
        const $r = cheerio.load(Buffer.from(redirectRes.data));

        const finalLink = $r(
          ".site-container .page-redirect .container .row .mx-auto .my-5 .btn-loader a.link",
        )
          .attr("href")
          ?.trim();

        console.log(`final link: ${finalLink}`);

        if (finalLink) target[key] = finalLink;
      } catch (_) {}
    }
  }

  private async scrapeGet(
    url: string,
    config: AxiosRequestConfig,
  ): Promise<AxiosResponse<ArrayBuffer>> {
    await this.scrapeLimiter.acquire();
    return axios.get<ArrayBuffer>(url, config);
  }

  resolveMediaUrl(url: string): string {
    if (!url?.trim()) return "";
    const trimmed = url.trim();
    if (trimmed.startsWith("data:")) return "";
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.startsWith("//")) return `https:${trimmed}`;
    if (trimmed.startsWith("/")) return `${this.siteOrigin}${trimmed}`;
    return `${this.siteOrigin}/${trimmed}`;
  }

  isAllowedProxyUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) return false;
      const host = parsed.hostname.toLowerCase();
      if (
        host === "localhost" ||
        host === "127.0.0.1" ||
        host.startsWith("192.168.") ||
        host.startsWith("10.") ||
        host.endsWith(".local")
      ) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  async fetchProxiedImage(
    url: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const resolved = this.resolveMediaUrl(url);
    if (!resolved || !this.isAllowedProxyUrl(resolved)) {
      throw new Error("رابط الصورة غير مسموح");
    }

    const res = await this.scrapeGet(resolved, {
      headers: { ...this.headers, Referer: `${this.siteOrigin}/` },
      responseType: "arraybuffer",
      timeout: 15000,
      validateStatus: (s) => s >= 200 && s < 400,
    });

    const contentType = (res.headers["content-type"] as string) || "image/jpeg";
    return { buffer: Buffer.from(res.data), contentType };
  }

  private extractEntryImage($: cheerio.CheerioAPI, item: Element): string {
    const entry = $(item).find(".entry-image").first();
    const imgEl = entry.find("img").first();

    const candidates: string[] = [
      imgEl.attr("data-src"),
      imgEl.attr("data-lazy-src"),
      imgEl.attr("data-original"),
      imgEl.attr("data-lazy-srcset"),
      imgEl.attr("data-srcset"),
      imgEl.attr("srcset"),
      imgEl.attr("src"),
    ]
      .filter(Boolean)
      .flatMap((v) => {
        if (v!.includes(",")) return [this.firstSrcFromSrcset(v)];
        return [v!];
      });

    entry.find("source").each((_, src) => {
      const srcset = $(src).attr("srcset");
      const srcAttr = $(src).attr("src");
      if (srcset) candidates.push(this.firstSrcFromSrcset(srcset));
      if (srcAttr) candidates.push(srcAttr);
    });

    const style = `${entry.attr("style") || ""} ${imgEl.attr("style") || ""}`;
    const bgMatch = style.match(/url\(\s*['"]?([^'")\s]+)['"]?\s*\)/i);
    if (bgMatch?.[1]) candidates.push(bgMatch[1]);

    for (const raw of candidates) {
      const resolved = this.resolveMediaUrl(raw);
      if (resolved && !this.isPlaceholderImage(resolved)) return resolved;
    }
    return "";
  }

  private isPlaceholderImage(url: string): boolean {
    const lower = url.toLowerCase();
    return (
      lower.includes("placeholder") ||
      lower.includes("1x1") ||
      lower.includes("blank.") ||
      lower.endsWith(".svg") ||
      /\/spacer[./]/i.test(lower)
    );
  }

  private firstSrcFromSrcset(srcset?: string): string {
    if (!srcset) return "";
    const first = srcset.split(",")[0]?.trim().split(/\s+/)[0];
    return first || "";
  }
}
