/* eslint-disable */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const created = [];

function w(rel, content) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content.replace(/\r?\n/g, '\n'));
  created.push(rel);
}

const pkg = (name, port, extra = {}) =>
  JSON.stringify(
    {
      name: `@mova/${name}`,
      version: '1.0.0',
      private: true,
      scripts: {
        build: 'nest build',
        start: 'nest start',
        'start:dev': 'nest start --watch',
        'start:prod': 'node dist/main',
        test: 'jest',
        'test:e2e': 'jest --config ./test/jest-e2e.json',
        'prisma:generate': 'prisma generate',
        'prisma:migrate': 'prisma migrate dev',
        'prisma:seed': 'ts-node prisma/seed.ts',
      },
      dependencies: {
        '@mova/shared': 'file:../../packages/shared',
        '@nestjs/common': '^10.0.0',
        '@nestjs/config': '^3.3.0',
        '@nestjs/core': '^10.0.0',
        '@nestjs/jwt': '^10.2.0',
        '@nestjs/passport': '^10.0.3',
        '@nestjs/platform-express': '^10.0.0',
        '@nestjs/swagger': '^7.4.2',
        'class-transformer': '^0.5.1',
        'class-validator': '^0.14.4',
        ioredis: '^5.11.1',
        passport: '^0.7.0',
        'passport-jwt': '^4.0.1',
        'reflect-metadata': '^0.2.0',
        rxjs: '^7.8.1',
        ...extra,
      },
      devDependencies: {
        '@nestjs/cli': '^10.0.0',
        '@nestjs/schematics': '^10.0.0',
        '@nestjs/testing': '^10.0.0',
        '@types/express': '^5.0.0',
        '@types/jest': '^29.5.2',
        '@types/node': '^20.3.1',
        '@types/passport-jwt': '^4.0.1',
        '@types/supertest': '^6.0.0',
        jest: '^29.5.0',
        prettier: '^3.0.0',
        'source-map-support': '^0.5.21',
        supertest: '^7.0.0',
        'ts-jest': '^29.1.0',
        'ts-node': '^10.9.1',
        typescript: '^5.1.3',
        ...(extra['@prisma/client'] ? { '@prisma/client': '^5.22.0', prisma: '^5.22.0' } : {}),
      },
      jest: {
        moduleFileExtensions: ['js', 'json', 'ts'],
        rootDir: 'src',
        testRegex: '.*\\.spec\\.ts$',
        transform: { '^.+\\.(t|j)s$': 'ts-jest' },
        testEnvironment: 'node',
      },
    },
    null,
    2,
  );

const tsconfig = JSON.stringify(
  {
    compilerOptions: {
      module: 'commonjs',
      declaration: true,
      removeComments: true,
      emitDecoratorMetadata: true,
      experimentalDecorators: true,
      allowSyntheticDefaultImports: true,
      target: 'ES2021',
      sourceMap: true,
      outDir: './dist',
      baseUrl: './',
      incremental: true,
      skipLibCheck: true,
      strictNullChecks: false,
      noImplicitAny: false,
    },
  },
  null,
  2,
);

const nestCli = JSON.stringify(
  { collection: '@nestjs/schematics', sourceRoot: 'src', compilerOptions: { deleteOutDir: true } },
  null,
  2,
);

const prismaModule = `import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
`;

const prismaService = `import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}
`;

const internalGuard = `import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { INTERNAL_API_KEY } from '@mova/shared';
@Injectable()
export class InternalApiGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    return req.headers['x-internal-api-key'] === INTERNAL_API_KEY;
  }
}
`;

const jwtAuthGuard = `import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
`;

const jwtStrategy = `import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET') ?? 'dev_secret',
    });
  }
  validate(payload: { sub: string; phone: string; role: string }) {
    return { id: payload.sub, phone: payload.phone, role: payload.role };
  }
}
`;

function mainTs(port, label, extra = '') {
  return `import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from '@mova/shared';
${extra}
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',') ?? '*', credentials: true });
  app.setGlobalPrefix('api', { exclude: ['health', 'internal/(.*)'] });
  const port = process.env.PORT ?? ${port};
  await app.listen(port);
  console.log('MOVA ${label} on port ' + port);
}
bootstrap();
`;
}

function healthCtrl(svc, withDb) {
  return `import { Controller, Get } from '@nestjs/common';
import { MARKET_RDC } from '@mova/shared';
${withDb ? "import { PrismaService } from '../prisma/prisma.service';" : ''}
@Controller()
export class HealthController {
  ${withDb ? 'constructor(private prisma: PrismaService) {}' : ''}
  @Get('health')
  async health() {
    ${withDb ? `let dbOk = false;
    try { await this.prisma.$queryRaw\`SELECT 1\`; dbOk = true; } catch { dbOk = false; }` : 'const dbOk = true;'}
    return { status: dbOk ? 'ok' : 'degraded', service: '${svc}', version: '1.0.0', market: MARKET_RDC.country, city: MARKET_RDC.defaultCity, timestamp: new Date().toISOString(), database: dbOk ? 'connected' : 'disconnected' };
  }
}
`;

function setupBase(name, port, withDb, extraDeps = {}) {
  const dir = `services/${name}`;
  w(`${dir}/package.json`, pkg(name, port, extraDeps));
  w(`${dir}/tsconfig.json`, tsconfig);
  w(`${dir}/tsconfig.build.json`, JSON.stringify({ extends: './tsconfig.json', exclude: ['node_modules', 'test', 'dist', '**/*spec.ts'] }, null, 2));
  w(`${dir}/nest-cli.json`, nestCli);
  w(`${dir}/src/health/health.module.ts`, `import { Module } from '@nestjs/common';\nimport { HealthController } from './health.controller';\n@Module({ controllers: [HealthController] })\nexport class HealthModule {}\n`);
  w(`${dir}/src/health/health.controller.ts`, healthCtrl(name, withDb));
  if (withDb) {
    w(`${dir}/src/prisma/prisma.module.ts`, prismaModule);
    w(`${dir}/src/prisma/prisma.service.ts`, prismaService);
  }
}

function serviceDockerfile(serviceName) {
  const hasPrisma = !['api-gateway', 'admin-service'].includes(serviceName);
  return `# Build stage
FROM node:22-alpine AS builder
WORKDIR /app
COPY packages/shared ./packages/shared
COPY services/${serviceName}/package*.json ./services/${serviceName}/
WORKDIR /app/services/${serviceName}
RUN npm ci
COPY services/${serviceName}/ ./
${hasPrisma ? 'RUN npx prisma generate\nRUN npm run build' : 'RUN npm run build'}

# Production stage
FROM node:22-alpine AS production
WORKDIR /app
RUN apk add --no-cache openssl
COPY packages/shared ./packages/shared
COPY services/${serviceName}/package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/services/${serviceName}/dist ./dist
${hasPrisma ? `COPY --from=builder /app/services/${serviceName}/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/services/${serviceName}/prisma ./prisma
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]` : `ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/main.js"]`}
`;
}
