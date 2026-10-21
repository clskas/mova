import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';
import { HttpExceptionFilter, assertProductionSecurity, resolveCorsOrigin } from '@mova/shared';

function isTransientDbNoise(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  const lower = msg.toLowerCase();
  return (
    lower.includes('service temporarily unavailable') ||
    lower.includes('p1017') ||
    lower.includes('p1001') ||
    lower.includes('p1002') ||
    lower.includes('database system is starting up') ||
    lower.includes('server has closed the connection')
  );
}

// Render starter OOMs / exit-1 when Prisma FATAL dumps are treated as fatal unhandled rejections.
process.on('unhandledRejection', (reason) => {
  if (isTransientDbNoise(reason)) {
    console.warn('[ride-service] swallowed transient DB unhandledRejection');
    return;
  }
  console.error('[ride-service] unhandledRejection', reason);
});

async function bootstrap() {
  assertProductionSecurity('ride-service');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  // Base64 parcel photos (~3 Mo fichier → ~4 Mo JSON) dépassent la limite Express par défaut (100 kb).
  app.useBodyParser('json', { limit: '8mb' });
  app.useBodyParser('urlencoded', { limit: '8mb', extended: true });
  app.useWebSocketAdapter(new IoAdapter(app));
  // Do NOT useStaticAssets for uploads: Render disk is ephemeral. Serving only via
  // UploadsService (Postgres → Supabase) prevents "works until next deploy" ghosts.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableCors({ origin: resolveCorsOrigin(), credentials: true });
  app.setGlobalPrefix('api', {
    exclude: ['health', 'health/live', 'api/health/live', 'internal/(.*)'],
  });
  const port = process.env.PORT ?? 3002;
  await app.listen(port);
  console.log('SENGA ride-service on port ' + port);
}
bootstrap();
