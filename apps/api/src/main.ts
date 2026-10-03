import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { RedisIoAdapter } from './realtime/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);
  // Behind one nginx hop in production: req.ip must be the visitor, not the
  // proxy, or every demo signup shares a single rate-limit bucket.
  app.set('trust proxy', 1);

  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({
    origin: config.get<string>('WEB_ORIGIN', 'http://localhost:3000'),
    credentials: true,
  });

  const adapter = new RedisIoAdapter(app);
  adapter.connect();
  app.useWebSocketAdapter(adapter);

  const port = Number(config.get<string>('API_PORT', '4000'));
  await app.listen(port, '0.0.0.0');
  new Logger('bootstrap').log(`api listening on ${port}`);
}

void bootstrap();
