import { Injectable, Logger } from '@nestjs/common';
import * as dns from 'dns';
import { ScrapingException } from '../../core/errors/domain.exception';
import { AkwamHttpClient } from './akwam-http-client.service';
import { isPrivateOrReservedIp } from '../../application/validators/sanitization.util';

@Injectable()
export class AkwamImageProxyService {
  private readonly logger = new Logger(AkwamImageProxyService.name);

  private static readonly ALLOWED_IMAGE_HOSTS = new Set([
    'ak.sv',
    'img.ak.sv',
    'akwam.cx',
    'akwam.to',
    'akwam.ss',
    'img.downet.net',
    'downet.net',
  ]);

  private static readonly ALLOWED_IMAGE_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/avif',
    'image/gif',
  ]);

  constructor(private readonly httpClient: AkwamHttpClient) {}

  async fetchProxiedImage(
    url: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const resolved = this.httpClient.resolveMediaUrl(url);
    if (!resolved) {
      throw new ScrapingException('رابط الصورة غير صالح');
    }

    const isAllowed = await this.isAllowedProxyUrl(resolved);
    if (!isAllowed) {
      throw new ScrapingException('رابط الصورة غير مسموح به (خارج النطاق المصرح أو عنوان شبكة داخلية محظور)');
    }

    const res = await this.httpClient.get<ArrayBuffer>(resolved, {
      headers: { Referer: `${this.httpClient.siteOrigin}/` },
      timeout: 10000,
      maxRedirects: 0,
      maxContentLength: 5_000_000,
      maxBodyLength: 5_000_000,
      validateStatus: (status) => status >= 200 && status < 400,
    });

    const rawType = (res.headers['content-type'] as string) || '';
    const cleanType = rawType.split(';')[0].trim().toLowerCase();

    // Reject non-image and reject SVG (prevent SVG XSS attacks)
    if (!AkwamImageProxyService.ALLOWED_IMAGE_TYPES.has(cleanType)) {
      throw new ScrapingException('صيغة الملف المسترجع غير مسموح بها كصورة آمنة');
    }

    return { buffer: Buffer.from(res.data), contentType: cleanType };
  }

  async isAllowedProxyUrl(url: string): Promise<boolean> {
    try {
      const parsed = new URL(url);

      // Enforce HTTPS
      if (parsed.protocol !== 'https:') return false;

      // Only default port or 443
      if (parsed.port && parsed.port !== '443') return false;

      const host = parsed.hostname.toLowerCase();

      // Check allowlist
      const isWhitelistedHost =
        AkwamImageProxyService.ALLOWED_IMAGE_HOSTS.has(host) ||
        host.endsWith('.ak.sv') ||
        host.endsWith('.downet.net') ||
        host.endsWith('.akwam.ss');

      if (!isWhitelistedHost) return false;

      // Defense in depth: Verify resolved IP is NOT private or loopback (Anti-DNS Rebinding)
      try {
        const { address } = await dns.promises.lookup(host);
        if (isPrivateOrReservedIp(address)) {
          this.logger.warn(`SSRF Blocked: Host ${host} resolved to reserved IP: ${address}`);
          return false;
        }
      } catch (dnsErr) {
        this.logger.warn(`DNS lookup failed for ${host}: ${dnsErr}`);
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }
}
