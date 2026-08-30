import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { HttpExceptionFilter, resolveCorsOrigin } from '@mova/shared';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // Capture raw body for HMAC (docs/AFRISOFT_SMS_OTP_HUB_API.md §3).
  app.use(
    json({
      verify: (req: Request & { rawBody?: string }, _res: Response, buf: Buffer) => {
        req.rawBody = buf?.length ? buf.toString('utf8') : '';
      },
    }),
  );
  app.use((req: Request & { rawBody?: string }, _res: Response, next: NextFunction) => {
    if (req.rawBody === undefined) req.rawBody = '';
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableCors({ origin: resolveCorsOrigin(), credentials: true });

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  const provider = (process.env.SMS_PROVIDER ?? 'mock').trim().toLowerCase() || 'mock';
  console.log(`AfriSoft SMS hub on port ${port} (SMS_PROVIDER=${provider})`);
}
bootstrap();
