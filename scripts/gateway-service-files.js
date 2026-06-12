/* eslint-disable */
module.exports.writeAll = function writeAll(w) {
  w('services/api-gateway/src/proxy/proxy.middleware.ts', `import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { Request, Response, NextFunction } from 'express';
import { SERVICE_PORTS } from '@mova/shared';

const ROUTES: Record<string, keyof typeof SERVICE_PORTS> = {
  '/api/auth': 'auth',
  '/api/users': 'auth',
  '/api/rides': 'ride',
  '/api/geo': 'ride',
  '/api/ratings': 'ride',
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
      const target = this.config.get(envMap[svc]) ?? \`http://localhost:\${SERVICE_PORTS[svc]}\`;
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
`);

  w('services/api-gateway/src/auth/jwt-auth.guard.ts', `import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

const PUBLIC_PATHS = ['/api/auth/otp/request', '/api/auth/otp/verify', '/health'];

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const path = req.originalUrl ?? req.url;
    if (PUBLIC_PATHS.some((p) => path.startsWith(p))) return true;
    if (path.startsWith('/api/geo')) return true;
    return super.canActivate(context);
  }
  handleRequest(err: unknown, user: unknown) {
    if (err || !user) throw err || new UnauthorizedException();
    return user;
  }
}
`);

  w('services/api-gateway/src/auth/jwt.strategy.ts', `import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), ignoreExpiration: false, secretOrKey: config.get('JWT_SECRET') ?? 'dev_secret' });
  }
  validate(payload: { sub: string; phone: string; role: string }) {
    return { id: payload.sub, phone: payload.phone, role: payload.role };
  }
}
`);

  w('services/api-gateway/src/auth/auth.module.ts', `import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' }), JwtModule.registerAsync({ imports: [ConfigModule], useFactory: (c: ConfigService) => ({ secret: c.get('JWT_SECRET') ?? 'dev_secret' }), inject: [ConfigService] })],
  providers: [JwtStrategy, JwtAuthGuard],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
`);

  w('services/api-gateway/src/health/health.controller.ts', `import { Controller, Get } from '@nestjs/common';
import { MARKET_RDC, SERVICE_PORTS, serviceUrl } from '@mova/shared';

@Controller()
export class HealthController {
  @Get('health')
  async health() {
    const services = ['auth', 'ride', 'payment', 'driver', 'notification', 'admin'] as const;
    const checks = await Promise.all(
      services.map(async (name) => {
        try {
          const res = await fetch(serviceUrl(name, '/health'), { signal: AbortSignal.timeout(3000) });
          const data = await res.json();
          return { name, status: res.ok ? 'ok' : 'degraded', port: SERVICE_PORTS[name], ...data };
        } catch {
          return { name, status: 'down', port: SERVICE_PORTS[name] };
        }
      }),
    );
    const allOk = checks.every((c) => c.status === 'ok');
    return { status: allOk ? 'ok' : 'degraded', service: 'api-gateway', version: '1.0.0', market: MARKET_RDC.country, city: MARKET_RDC.defaultCity, timestamp: new Date().toISOString(), services: checks };
  }
}
`);

  w('services/api-gateway/src/health/health.module.ts', `import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
@Module({ controllers: [HealthController] })
export class HealthModule {}
`);

  w('services/api-gateway/src/app.module.ts', `import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { ProxyMiddleware } from './proxy/proxy.middleware';
import { JwtAuthGuard } from './auth/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    AuthModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ProxyMiddleware).forRoutes({ path: 'api/*', method: RequestMethod.ALL });
  }
}
`);

  w('services/api-gateway/test/jest-e2e.json', JSON.stringify({ moduleFileExtensions: ['js', 'json', 'ts'], rootDir: '.', testEnvironment: 'node', testRegex: '.e2e-spec.ts$', transform: { '^.+\\.(t|j)s$': 'ts-jest' } }, null, 2));

  w('services/api-gateway/test/gateway.e2e-spec.ts', `import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('ApiGateway (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('/health (GET) returns aggregated status', () => {
    return request(app.getHttpServer()).get('/health').expect(200).expect((res) => {
      expect(res.body.service).toBe('api-gateway');
      expect(res.body.services).toBeDefined();
    });
  });
});
`);
};
