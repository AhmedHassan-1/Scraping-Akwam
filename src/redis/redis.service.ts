import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>("redis.host", "127.0.0.1");
    const port = this.config.get<number>("redis.port", 6379);
    const password = this.config.get<string>("redis.password");

    this.client = new Redis({
      host,
      port,
      password: password || undefined,

      // مهم جدًا مع Redis Cloud
      tls: {},

      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      keepAlive: 30000,
      connectTimeout: 10000,
    });

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

  getBullMqConnection() {
    const host = this.config.get<string>("redis.host", "127.0.0.1");
    const port = this.config.get<number>("redis.port", 6379);
    const password = this.config.get<string>("redis.password");

    return {
      host,
      port,
      password: password || undefined,

      // مهم هنا برضو
      tls: {},

      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      keepAlive: 30000,
      connectTimeout: 10000,
    };
  }
}
