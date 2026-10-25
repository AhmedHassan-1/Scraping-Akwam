import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

@Injectable()
export class AkwamStreamService {
  private readonly logger = new Logger(AkwamStreamService.name);

  // Allowed domains pattern
  private readonly allowedDomainPatterns = [
    /(^|\.)downet\.net$/i,
    /(^|\.)akwam\.[a-z]+$/i,
    /(^|\.)ak\.sv$/i,
  ];

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

    const clientRange = req.headers.range || 'bytes=0-';
    const clientUserAgent =
      req.headers['user-agent'] ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    const client = parsed.protocol === 'https:' ? https : http;

    const requestOptions = {
      method: 'GET',
      headers: {
        Range: clientRange,
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

      remoteRes.pipe(res);
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
      remoteReq.destroy();
      if (!res.headersSent) {
        res.status(504).json({
          statusCode: 504,
          message: 'انتهت مهلة الاتصال بخادم الفيديو المصدر',
        });
      }
    });

    // Abort remote request when user pauses, seeks, or navigates away
    req.on('close', () => {
      remoteReq.destroy();
    });

    remoteReq.end();
  }
}
