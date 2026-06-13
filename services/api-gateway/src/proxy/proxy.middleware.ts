import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { Request, Response, NextFunction } from 'express';
import { SERVICE_PORTS } from '@mova/shared';

const ROUTES: Record<string, keyof typeof SERVICE_PORTS> = {
  '/api/auth': 'auth',
  '/api/users': 'auth',
  '/api/rides': 'ride',
  '/api/deliveries': 'ride',
  '/api/services': 'ride',
  '/api/carpool': 'ride',
  '/api/errands': 'ride',
  '/api/rental': 'ride',
  '/api/history': 'ride',
  '/api/express': 'ride',
  '/api/moving': 'ride',
  '/api/geo': 'ride',
  '/api/ratings': 'ride',
  '/api/uploads': 'ride',
  '/api/payments': 'payment',
  '/api/wallet': 'payment',
  '/api/drivers': 'driver',
  '/api/incidents': 'driver',
  '/api/notifications': 'notification',
  '/api/admin': 'admin',
};

@Injectable()
export class ProxyMiddleware implements NestMiddleware {
  private proxies = new Map<string, ReturnType<typeof createProxyMiddleware>>();

  constructor(private config: ConfigService) {
    const envMap: Record<string, string> = {
      auth: 'AUTH_SERVICE_URL',
      ride: 'RIDE_SERVICE_URL',
      payment: 'PAYMENT_SERVICE_URL',
      driver: 'DRIVER_SERVICE_URL',
      notification: 'NOTIFICATION_SERVICE_URL',
      admin: 'ADMIN_SERVICE_URL',
    };
    for (const svc of Object.values(ROUTES)) {
      const target = this.config.get(envMap[svc]) ?? `http://localhost:${SERVICE_PORTS[svc]}`;
      this.proxies.set(svc, createProxyMiddleware({ target, changeOrigin: true, pathRewrite: (path) => path }));
    }
  }

  use(req: Request, res: Response, next: NextFunction) {
    const path = req.originalUrl ?? req.url;
    const match = Object.keys(ROUTES).find((prefix) => path.startsWith(prefix));
    if (!match) return next();
    const svc = ROUTES[match];
    return this.proxies.get(svc)!(req, res, next);
  }
}
