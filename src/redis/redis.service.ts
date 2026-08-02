import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis, { RedisOptions } from "ioredis";

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(private readonly config: ConfigService) {
    this.client = new Redis(this.buildOptions());

    this.client.on("connect", () => {
      console.log("Redis Connected");
    });

    this.client.on("error", (err) => {
      console.error("Redis Error:", err);
    });
  }

  onModuleDestroy() {
    this.client.disconnect();
  }

  /**
   * بناء خيارات الاتصال بـ Redis
   * TLS يُفعَّل فقط إذا كانت هناك كلمة مرور (بيئة Production)
   */
  private buildOptions(): RedisOptions {
    const host = this.config.get<string>("redis.host", "127.0.0.1");
    const port = this.config.get<number>("redis.port", 6379);
    const password = this.config.get<string>("redis.password");

    const isProduction = !!password; // TLS مطلوب فقط مع managed Redis (Upstash / Redis Cloud)

    return {
      host,
      port,
      password: password || undefined,
      tls: isProduction ? {} : undefined, // ✅ لا TLS مع localhost
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      keepAlive: 30000,
      connectTimeout: 10000,
    };
  }

  /** اتصال منفصل لـ BullMQ (لا يشارك نفس connection الـ client) */
  getBullMqConnection(): RedisOptions {
    return this.buildOptions();
  }
}
