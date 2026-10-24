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
   * Step 1: Listing page -> parse download page URL
   * Step 2: Download page -> parse redirect page URL
   * Step 3: Redirect page -> parse direct download URL
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
        resolved.push({
          ...q,
          downloadUrl: finalUrl || q.downloadUrl,
        });
      } catch (err) {
        this.logger.warn(`Failed to resolve quality ${q.quality}: ${err}`);
        resolved.push(q);
      }
    }

    return resolved;
  }

  private async resolveSingleQuality(
    downloadUrl: string,
    signal?: AbortSignal,
  ): Promise<string | null> {
    // Step 1: Open download listing page
    const dlPageRes = await this.httpClient.get(downloadUrl, { signal });
    const downloadPageUrl = DownloadLinksParser.parseRedirectUrlFromDownloadPage(
      Buffer.from(dlPageRes.data),
    );

    if (!downloadPageUrl) return null;

    // Step 2: Open download page to get redirect page
    const redirectPageRes = await this.httpClient.get(downloadPageUrl, { signal });
    return DownloadLinksParser.parseFinalDirectUrlFromRedirectPage(
      Buffer.from(redirectPageRes.data),
    );
  }
}
