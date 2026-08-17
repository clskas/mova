import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded, Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { HttpExceptionFilter, assertProductionSecurity, resolveCorsOrigin } from '@mova/shared';

async function bootstrap() {
  assertProductionSecurity('payment-service');
  const app = await NestFactory.create(AppModule, { rawBody: true, bodyParser: false });
  app.use(
    json({
      verify: (req: Request & { rawBody?: string }, _res: Response, buf: Buffer) => {
        req.rawBody = buf?.length ? buf.toString('utf8') : '';
      },
    }),
  );
  app.use(
    urlencoded({
      extended: true,
      verify: (req: Request & { rawBody?: string }, _res: Response, buf: Buffer) => {
        req.rawBody = buf?.length ? buf.toString('utf8') : '';
      },
    }),
  );
  app.use((req: Request & { rawBody?: string }, _res: Response, next: NextFunction) => {
    if (req.rawBody === undefined) req.rawBody = '';
    next();
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableCors({ origin: resolveCorsOrigin(), credentials: true });
  app.setGlobalPrefix('api', { exclude: ['health', 'internal/(.*)', 'v1/(.*)'] });
  const port = process.env.PORT ?? 3003;
  await app.listen(port);
  const hubMode = (process.env.AFRISOFT_PAY_HUB_MODE ?? '').trim().toLowerCase() === 'true';
  console.log(`SENGA payment-service on port ${port}${hubMode ? ' (AfriSoft pay hub /v1)' : ''}`);
}
bootstrap();
