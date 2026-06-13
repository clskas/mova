import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { join } from 'path';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from '@mova/shared';
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useWebSocketAdapter(new IoAdapter(app));
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/api/uploads/' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',') ?? '*', credentials: true });
  app.setGlobalPrefix('api', { exclude: ['health', 'internal/(.*)'] });
  const port = process.env.PORT ?? 3002;
  await app.listen(port);
  console.log('MOVA ride-service on port ' + port);
}
bootstrap();
