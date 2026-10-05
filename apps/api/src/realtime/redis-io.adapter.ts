import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { INestApplicationContext } from '@nestjs/common';
import type { ServerOptions } from 'socket.io';
import { RedisService } from '../redis/redis.service';

/** Fans board events out across every api instance (spec section 13). */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;

  constructor(private readonly app: INestApplicationContext) {
    super(app);
  }

  connect() {
    const redis = this.app.get(RedisService);
    // Pub/sub channels are global to a Redis server, whatever the database
    // number. A key of our own keeps another socket.io app sharing the same
    // Redis from receiving these broadcasts, or sending us its own.
    this.adapterConstructor = createAdapter(redis.pub, redis.sub, {
      key: process.env.SOCKET_IO_REDIS_KEY ?? 'socket.io',
    });
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }
}
