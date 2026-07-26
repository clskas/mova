import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { SERVICE_PORTS } from '@mova/shared';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from '@mova/shared';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',') ?? '*', credentials: true });

  const rideTarget = process.env.RIDE_SERVICE_URL ?? `http://localhost:${SERVICE_PORTS.ride}`;
  const socketProxy = createProxyMiddleware({ target: rideTarget, changeOrigin: true, ws: true });
  app.use('/socket.io', socketProxy);

  const server = app.getHttpServer();
  server.on('upgrade', (req: { url?: string }, socket: unknown, head: unknown) => {
    if (req.url?.startsWith('/socket.io')) {
      (socketProxy as { upgrade: (a: unknown, b: unknown, c: unknown) => void }).upgrade(req, socket, head);
    }
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`SENGA api-gateway on port ${port} (HTTP + WebSocket /tracking via socket.io proxy)`);
}
bootstrap();
