import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { pipeline } from 'stream';

@Injectable()
export class AkwamStreamService {
  private readonly logger = new Logger(AkwamStreamService.name);

  // Progressive chunk size: 3MB (3,145,728 bytes).
  // Balances instant playback startup (<200ms) with smooth, buffer-efficient playback.
  // Prevents network saturation, memory bloat, and severe video lag.
  private readonly DEFAULT_CHUNK_SIZE = 3 * 1024 * 1024;
  private readonly MIN_CHUNK_SIZE = 1 * 1024 * 1024;
  private readonly MAX_CHUNK_SIZE = 8 * 1024 * 1024;

  // Allowed domains pattern
  private readonly allowedDomainPatterns = [
    /(^|\.)downet\.net$/i,
    /(^|\.)akwam\.[a-z]+$/i,
    /(^|\.)ak\.sv$/i,
  ];

  /**
   * Resolves a bounded Range header to prevent overwhelming browser memory & bandwidth.
   * If the client sends an open-ended range ("bytes=0-" or "bytes=3145728-"), or requests an excessively large slice,
   * it caps the slice to a chunk size (default 3MB) so the browser loads chunk-by-chunk on demand.
   */
  resolveBoundedRange(
    rawRange: string | undefined,
    chunkParam?: string | number,
  ): string {
    let chunkSize = this.DEFAULT_CHUNK_SIZE;
    if (chunkParam) {
      const parsed = parseInt(String(chunkParam), 10);
      if (!isNaN(parsed) && parsed > 0) {
        chunkSize = Math.max(
          this.MIN_CHUNK_SIZE,
          Math.min(this.MAX_CHUNK_SIZE, parsed * 1024 * 1024),
        );
      }
    }

    if (!rawRange) {
      return `bytes=0-${chunkSize - 1}`;
    }

    const trimmed = rawRange.trim();
    const match = trimmed.match(/^bytes=(\d*)-(\d*)$/);

    if (!match) {
      return trimmed;
    }

    const startStr = match[1];
    const endStr = match[2];

    // Suffix range: bytes=-1048576 (e.g. requesting last 1MB for MP4 moov metadata)
    if (!startStr && endStr) {
      return trimmed;
    }

    const start = startStr ? parseInt(startStr, 10) : 0;

    if (endStr) {
      const end = parseInt(endStr, 10);
      const requestedLength = end - start + 1;

      // Honor smaller ranges (e.g. metadata probing bytes=0-1024)
      if (requestedLength <= chunkSize) {
        return `bytes=${start}-${end}`;
      }

      // Cap excessively large ranges to prevent buffer bloating
      const cappedEnd = start + chunkSize - 1;
      return `bytes=${start}-${cappedEnd}`;
    }

    // Open-ended range: bytes=start- -> cap to start + chunkSize - 1
    const cappedEnd = start + chunkSize - 1;
    return `bytes=${start}-${cappedEnd}`;
  }

  validateUrl(targetUrl: string): URL {
    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
      throw new BadRequestException('رابط الفيديو غير صالح');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new BadRequestException('بروتوكول الرابط يجب أن يكون HTTP أو HTTPS');
    }

    const hostname = parsed.hostname.toLowerCase();

    // Prevent SSRF / Private network access
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.16.') ||
      hostname === '169.254.169.254'
    ) {
      throw new BadRequestException('الوصول للشبكات الداخلية محظور أمنياً');
    }

    const isAllowed = this.allowedDomainPatterns.some((pattern) =>
      pattern.test(hostname),
    );

    if (!isAllowed) {
      throw new BadRequestException(
        `نطاق الخادم (${hostname}) غير مصرح به للبث المباشر`,
      );
    }

    return parsed;
  }

  streamVideo(targetUrl: string, req: Request, res: Response): void {
    const parsed = this.validateUrl(targetUrl);

    const chunkParam = (req.query?.chunk as string | undefined) || undefined;
    const targetRange = this.resolveBoundedRange(req.headers.range, chunkParam);
    const clientUserAgent =
      req.headers['user-agent'] ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    const client = parsed.protocol === 'https:' ? https : http;
    const isHead = req.method?.toUpperCase() === 'HEAD';

    const requestOptions = {
      method: isHead ? 'HEAD' : 'GET',
      headers: {
        Range: targetRange,
        'User-Agent': clientUserAgent,
        Accept: '*/*',
        Referer: parsed.origin + '/',
      },
      timeout: 30000,
    };

    const remoteReq = client.request(parsed, requestOptions, (remoteRes) => {
      const statusCode = remoteRes.statusCode || 200;

      // Detect MIME type based on file extension
      let contentType = 'video/mp4';
      if (parsed.pathname.endsWith('.webm')) contentType = 'video/webm';
      else if (parsed.pathname.endsWith('.mkv')) contentType = 'video/mp4'; // Map MKV to video/mp4 for browser compatibility
      else if (parsed.pathname.endsWith('.avi')) contentType = 'video/x-msvideo';

      // Set standard streaming headers for seamless HTML5 <video> & Plyr playback
      res.statusCode = statusCode;
      res.setHeader('Content-Type', contentType);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Range, Accept, Origin, Content-Type',
      );
      res.setHeader(
        'Access-Control-Expose-Headers',
        'Content-Range, Content-Length, Accept-Ranges',
      );
      res.setHeader('Cache-Control', 'public, max-age=3600');

      if (remoteRes.headers['content-range']) {
        res.setHeader('Content-Range', remoteRes.headers['content-range']);
      }
      if (remoteRes.headers['content-length']) {
        res.setHeader('Content-Length', remoteRes.headers['content-length']);
      }

      if (isHead) {
        res.end();
        return;
      }

      remoteRes.on('error', (err) => {
        this.logger.debug(`Remote stream response error: ${err.message}`);
      });

      pipeline(remoteRes, res, (err) => {
        if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
          this.logger.debug(`Video stream pipeline ended: ${err.message}`);
        }
      });
    });

    remoteReq.on('error', (err) => {
      this.logger.error(`Stream proxy error for ${targetUrl}: ${err.message}`);
      if (!res.headersSent) {
        res.status(502).json({
          statusCode: 502,
          message: 'تعذر الاتصال بخادم الفيديو المصدر',
        });
      }
    });

    remoteReq.on('timeout', () => {
      try {
        remoteReq.destroy();
      } catch (_) {}
      if (!res.headersSent) {
        res.status(504).json({
          statusCode: 504,
          message: 'انتهت مهلة الاتصال بخادم الفيديو المصدر',
        });
      }
    });

    // Abort remote request when user pauses, seeks, or navigates away
    req.on('close', () => {
      try {
        remoteReq.destroy();
      } catch (_) {}
    });

    res.on('error', (err) => {
      this.logger.debug(`Client stream response error: ${err.message}`);
      try {
        remoteReq.destroy();
      } catch (_) {}
    });

    remoteReq.end();
  }
}
