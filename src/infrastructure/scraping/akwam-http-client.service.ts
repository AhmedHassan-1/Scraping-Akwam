import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import * as http from 'http';
import * as https from 'https';
import { IRateLimiter } from '../../core/interfaces/rate-limiter.interface';

@Injectable()
export class AkwamHttpClient {
  private readonly logger = new Logger(AkwamHttpClient.name);
  public readonly siteOrigin: string;

  private readonly httpAgent = new http.Agent({ keepAlive: true, maxSockets: 50 });
  private readonly httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50 });

  private readonly defaultHeaders = {
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
    'content-type': 'text/html; charset=UTF-8',
    'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    charset: 'utf-8',
  };

  private readonly client: AxiosInstance;

  constructor(
    @Inject('IRateLimiter')
    private readonly rateLimiter: IRateLimiter,
    @Optional()
    private readonly config?: ConfigService,
  ) {
    const rawOrigin =
      this.config?.get<string>('akwam.baseUrl') ||
      process.env.AKWAM_BASE_URL ||
      'https://ak.sv';
    this.siteOrigin = rawOrigin.replace(/\/+$/, '');

    this.client = axios.create({
      httpAgent: this.httpAgent,
      httpsAgent: this.httpsAgent,
      timeout: 15000,
      headers: this.defaultHeaders,
    });
  }

  async get<T = ArrayBuffer>(
    url: string,
    config: AxiosRequestConfig = {},
  ): Promise<AxiosResponse<T>> {
    await this.rateLimiter.acquire();
    return this.client.get<T>(url, {
      responseType: 'arraybuffer' as any,
      ...config,
      headers: {
        ...this.defaultHeaders,
        ...config.headers,
      },
    });
  }

  resolveMediaUrl(url: string): string {
    if (!url?.trim()) return '';
    const trimmed = url.trim();
    if (trimmed.startsWith('data:')) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.startsWith('//')) return `https:${trimmed}`;
    if (trimmed.startsWith('/')) return `${this.siteOrigin}${trimmed}`;
    return `${this.siteOrigin}/${trimmed}`;
  }
}
