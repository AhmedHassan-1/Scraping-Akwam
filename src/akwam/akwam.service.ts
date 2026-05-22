import { Injectable, HttpException, HttpStatus } from "@nestjs/common";
import axios from "axios";
import * as cheerio from "cheerio";
import { Movie, Series, Episode } from "./interfaces/akwam.interfaces";

@Injectable()
export class AkwamService {
  private readonly headers = {
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
    "content-type": "text/html; charset=UTF-8",
    "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    charset: "utf-8",
  };

  async getResults(search: string): Promise<object[]> {
    const allFilms: (string | Movie)[] = ["Movies"];
    const allSeries: (string | Series)[] = ["Series"];
    const final: (string | Movie | Series)[][] = [];

    // -------- جلب نتائج البحث --------
    const searchRes = await axios.get(`https://ak.sv/search?q=${search}`, {
      headers: this.headers,
      responseType: "arraybuffer",
    });
    const $ = cheerio.load(searchRes.data);

    const searchItems = $(
      ".site-container .page-search .container:nth-child(2) .widget .widget-body.row.flex-wrap .col-lg-auto.col-md-4.col-6.mb-12",
    );

    // -------- لوب على كل نتيجة بحث --------
    for (const item of searchItems.toArray()) {
      const link = $(item).find(".entry-image a").attr("href");
      if (!link) continue;

      const itemRes = await axios.get(link, {
        headers: this.headers,
        responseType: "arraybuffer",
      });
      const $p = cheerio.load(itemRes.data);

      const coverRow = $p(
        ".page-movie.page-film .movie-cover.mb-4.without-cover .container .row.py-4",
      );
      const infoCol = coverRow.children().eq(1);
      const infoItems = infoCol.children("div");

      const title = infoCol.find("h1").text().trim();
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
        // -------- معالجة المسلسلات --------
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
            .find(
              ".widget-body .row .bg-primary2.p-4.col-lg-4.col-md-6.col-12",
            );
        }

        const episodesList: Episode[] = [];

        for (const ep of episodesEl.toArray()) {
          const epLink = $p(ep).find("h2 a").attr("href");
          if (!epLink) continue;

          const epRes = await axios.get(epLink, {
            headers: this.headers,
            responseType: "arraybuffer",
          });
          const $e = cheerio.load(epRes.data);
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

          // جلب الرابط الحقيقي لكل جودة
          for (const key of Object.keys(episode)) {
            if (key === "Title" || key.endsWith("_")) continue;
            const dlLink = episode[key] as string;
            if (!dlLink.startsWith("http")) continue;

            try {
              const dlRes = await axios.get(dlLink, {
                headers: this.headers,
                responseType: "arraybuffer",
              });
              const $d = cheerio.load(dlRes.data);
              const finalLink = $d(
                ".site-container .page-download .content a",
              ).attr("href");
              if (finalLink) episode[key] = finalLink;
            } catch (_) {}
          }

          episodesList.push(episode);
        }

        series[title] = episodesList;
        allSeries.push(series);
      } else {
        // -------- معالجة الأفلام --------
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

        // جلب الرابط الحقيقي لكل جودة
        for (const key of Object.keys(movie)) {
          if (
            [
              "Title",
              "Image",
              "Rating",
              "Lang",
              "Quality",
              "Year",
              "Country",
              "Time",
              "Information",
            ].includes(key) ||
            key.endsWith("_")
          )
            continue;
          const dlLink = movie[key] as string;
          if (!dlLink.startsWith("http")) continue;

          try {
            const dlRes = await axios.get(dlLink, {
              headers: this.headers,
              responseType: "arraybuffer",
            });
            const $d = cheerio.load(dlRes.data);
            const finalLink = $d(
              ".site-container .page-download .content a",
            ).attr("href");
            if (finalLink) movie[key] = finalLink;
          } catch (_) {}
        }

        allFilms.push(movie);
      }
    }

    // -------- تجميع النتائج --------
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
