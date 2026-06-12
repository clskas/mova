#!/usr/bin/env node
/**
 * Scaffolds MOVA microservices structure. Run once during refactor.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function write(rel, content) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  console.log('wrote', rel);
}

const services = [
  { name: 'api-gateway', port: 3000, db: false },
  { name: 'auth-service', port: 3001, db: 'postgres-auth', dbName: 'mova_auth' },
  { name: 'ride-service', port: 3002, db: 'postgres-rides', dbName: 'mova_rides' },
  { name: 'payment-service', port: 3003, db: 'postgres-payments', dbName: 'mova_payments' },
  { name: 'driver-service', port: 3004, db: 'postgres-drivers', dbName: 'mova_drivers' },
  { name: 'notification-service', port: 3005, db: 'postgres-notifications', dbName: 'mova_notifications' },
  { name: 'admin-service', port: 3006, db: false },
];

const basePkg = (name, port, extraDeps = {}) => JSON.stringify({
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
    'ioredis': '^5.11.1',
    'passport': '^0.7.0',
    'passport-jwt': '^4.0.1',
    'reflect-metadata': '^0.2.0',
    'rxjs': '^7.8.1',
    ...extraDeps,
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
  },
  jest: {
    moduleFileExtensions: ['js', 'json', 'ts'],
    rootDir: 'src',
    testRegex: '.*\\.spec\\.ts$',
    transform: { '^.+\\.(t|j)s$': 'ts-jest' },
    testEnvironment: 'node',
  },
}, null, 2);

const tsconfig = JSON.stringify({
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
    strictBindCallApply: false,
    forceConsistentCasingInFileNames: false,
    noFallthroughCasesInSwitch: false,
  },
}, null, 2);

const nestCli = JSON.stringify({
  '$schema': 'https://json.schemastore.org/nest-cli',
  collection: '@nestjs/schematics',
  sourceRoot: 'src',
  compilerOptions: { deleteOutDir: true },
}, null, 2);

const mainTs = (serviceLabel) => `import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from '@mova/shared';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',') ?? '*', credentials: true });
  app.setGlobalPrefix('api', { exclude: ['health', 'internal'] });
  const port = process.env.PORT ?? ${services.find(s => s.name === serviceLabel)?.port ?? 3000};
  await app.listen(port);
  console.log(\`MOVA ${serviceLabel} on http://localhost:\${port}\`);
}
bootstrap();
`;

const healthModule = (serviceName) => `import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({ controllers: [HealthController] })
export class HealthModule {}
`;

const healthController = (serviceName, withDb = false) => `import { Controller, Get } from '@nestjs/common';
import { MARKET_RDC } from '@mova/shared';
${withDb ? "import { PrismaService } from '../prisma/prisma.service';" : ''}

@Controller()
export class HealthController {
  ${withDb ? 'constructor(private prisma: PrismaService) {}' : ''}

  @Get('health')
  async health() {
    ${withDb ? `let dbOk = false;
    try { await this.prisma.$queryRaw\`SELECT 1\`; dbOk = true; } catch { dbOk = false; }` : 'const dbOk = true;'}
    return {
      status: dbOk ? 'ok' : 'degraded',
      service: '${serviceName}',
      version: '1.0.0',
      market: MARKET_RDC.country,
      city: MARKET_RDC.defaultCity,
      timestamp: new Date().toISOString(),
      database: dbOk ? 'connected' : 'disconnected',
    };
  }
}
`;

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

for (const svc of services) {
  const dir = `services/${svc.name}`;
  const extraDeps = {};
  if (svc.db) {
    extraDeps['@prisma/client'] = '^5.22.0';
    extraDeps['prisma'] = '^5.22.0';
  }
  if (svc.name === 'ride-service') {
    extraDeps['@nestjs/platform-socket.io'] = '^10.4.22';
    extraDeps['@nestjs/websockets'] = '^10.4.22';
    extraDeps['socket.io'] = '^4.8.3';
  }
  if (svc.name === 'api-gateway') {
    extraDeps['http-proxy-middleware'] = '^3.0.3';
    extraDeps['@nestjs/throttler'] = '^6.2.1';
  }
  if (svc.name === 'admin-service') {
    extraDeps['@nestjs/axios'] = '^3.1.2';
    extraDeps['axios'] = '^1.7.9';
  }

  write(`${dir}/package.json`, basePkg(svc.name, svc.port, extraDeps));
  write(`${dir}/tsconfig.json`, tsconfig);
  write(`${dir}/tsconfig.build.json`, JSON.stringify({ extends: './tsconfig.json', exclude: ['node_modules', 'test', 'dist', '**/*spec.ts'] }, null, 2));
  write(`${dir}/nest-cli.json`, nestCli);
  write(`${dir}/src/main.ts`, mainTs(svc.name));

  const withDb = !!svc.db;
  write(`${dir}/src/health/health.module.ts`, healthModule(svc.name));
  write(`${dir}/src/health/health.controller.ts`, healthController(svc.name, withDb));

  if (withDb) {
    write(`${dir}/src/prisma/prisma.module.ts`, prismaModule);
    write(`${dir}/src/prisma/prisma.service.ts`, prismaService);
  }
}

console.log('Scaffold base complete');
