import { startSeatLimitsRefresh } from '@mova/shared';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import {
  HttpExceptionFilter,
  appLanguageMiddleware,
  assertProductionSecurity,
  installErrorReporting,
  resolveCorsOrigin,
} from '@mova/shared';

async function bootstrap() {
  assertProductionSecurity('driver-service');
  installErrorReporting('driver-service');
  const app = await NestFactory.create(AppModule);
  // Caller's app language (x-app-language) for texts built during the request.
  app.use(appLanguageMiddleware);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableCors({ origin: resolveCorsOrigin(), credentials: true });
  app.setGlobalPrefix('api', { exclude: ['health', 'internal/(.*)'] });
  const port = process.env.PORT ?? 3004;
  // Seat limits set in the admin (tricycle, Familiale…) for seat declarations.
  startSeatLimitsRefresh();
  await app.listen(port);
  console.log('SENGA driver-service on port ' + port);
}
bootstrap();
