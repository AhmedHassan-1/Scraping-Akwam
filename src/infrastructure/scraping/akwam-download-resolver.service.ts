import { Injectable, Logger } from '@nestjs/common';
import { DownloadQuality } from '../../core/domain/entities/download-quality.entity';
import { AkwamHttpClient } from './akwam-http-client.service';
import { DownloadLinksParser } from './parsers/download-links.parser';

@Injectable()
export class AkwamDownloadResolverService {
  private readonly logger = new Logger(AkwamDownloadResolverService.name);

  constructor(private readonly httpClient: AkwamHttpClient) {}

  /**
   * Resolves download qualities sequentially to respect global rate limits.
   * Directly extracts the real downloadable MP4/MKV URL from the Downet/Akwam redirect page.
   */
  async resolveQualitiesSequential(
    qualities: DownloadQuality[],
    signal?: AbortSignal,
    onQuality?: (qualityName: string) => void,
  ): Promise<DownloadQuality[]> {
    const resolved: DownloadQuality[] = [];

    for (const q of qualities) {
      if (!q.downloadUrl || signal?.aborted) {
        resolved.push(q);
        continue;
      }

      onQuality?.(q.quality);

      try {
        const finalUrl = await this.resolveSingleQuality(q.downloadUrl, signal);
        const resolvedUrl = finalUrl || q.downloadUrl;
        resolved.push({
          ...q,
          downloadUrl: resolvedUrl,
          watchUrl: resolvedUrl,
        });
      } catch (err) {
        this.logger.warn(`Failed to resolve quality ${q.quality}: ${err}`);
        resolved.push({
          ...q,
          watchUrl: q.downloadUrl,
        });
      }
    }

    return resolved;
  }

  private async resolveSingleQuality(
    downloadUrl: string,
    signal?: AbortSignal,
  ): Promise<string | null> {
    // If it is already a direct media server link, return immediately
    if (
      downloadUrl.includes('downet.net/download/') ||
      downloadUrl.endsWith('.mp4') ||
      downloadUrl.endsWith('.mkv')
    ) {
      return downloadUrl;
    }

    // Step 1: Open the Akwam download/redirect page
    const dlPageRes = await this.httpClient.get(downloadUrl, { signal });
    const buffer = Buffer.from(dlPageRes.data);

    // Primary: directly parse the final direct link (e.g. .btn-loader a.link.btn.btn-light)
    const directUrl = DownloadLinksParser.parseFinalDirectUrlFromRedirectPage(buffer);
    if (directUrl) return directUrl;

    // Fallback: If it was an older intermediate page, follow the redirect link
    const intermediateUrl = DownloadLinksParser.parseRedirectUrlFromDownloadPage(buffer);
    if (intermediateUrl && intermediateUrl !== downloadUrl) {
      const redirectPageRes = await this.httpClient.get(intermediateUrl, { signal });
      return DownloadLinksParser.parseFinalDirectUrlFromRedirectPage(
        Buffer.from(redirectPageRes.data),
      );
    }

    return null;
  }
}
