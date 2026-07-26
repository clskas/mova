import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter, assertProductionSecurity, resolveCorsOrigin } from '@mova/shared';

async function bootstrap() {
  assertProductionSecurity('auth-service');
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableCors({ origin: resolveCorsOrigin(), credentials: true });
  app.setGlobalPrefix('api', { exclude: ['health', 'internal/(.*)'] });
  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log('SENGA auth-service on port ' + port);
}
bootstrap();
