import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter, assertProductionSecurity, resolveCorsOrigin } from '@mova/shared';

async function bootstrap() {
  assertProductionSecurity('admin-service');
  const app = await NestFactory.create(AppModule);
  const http = app.getHttpAdapter().getInstance() as { set?: (k: string, v: unknown) => void };
  http.set?.('etag', false);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableCors({ origin: resolveCorsOrigin(), credentials: true });
  app.setGlobalPrefix('api', { exclude: ['health', 'internal/(.*)'] });
  const port = process.env.PORT ?? 3006;
  await app.listen(port);
  console.log('SENGA admin-service on port ' + port);
}
bootstrap();
