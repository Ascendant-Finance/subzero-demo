import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Holds the shared redis connections. The socket.io adapter needs its own
 * publisher and subscriber pair; presence uses the general client.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;
  readonly pub: Redis;
  readonly sub: Redis;

  constructor(config: ConfigService) {
    const url = config.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.client = new Redis(url, { maxRetriesPerRequest: null, lazyConnect: false });
    this.pub = this.client.duplicate();
    this.sub = this.client.duplicate();
    for (const conn of [this.client, this.pub, this.sub]) {
      conn.on('error', (error) => this.logger.error(`redis error: ${error.message}`));
    }
  }

  async onModuleDestroy() {
    await Promise.allSettled([this.client.quit(), this.pub.quit(), this.sub.quit()]);
  }
}
