/* eslint-disable */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

function w(rel, content) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content.replace(/\r?\n/g, '\n'));
}

const pkg = (name, port, extra = {}) => JSON.stringify({
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
}, null, 2);

const tsconfig = JSON.stringify({
  compilerOptions: {
    module: 'commonjs', declaration: true, removeComments: true,
    emitDecoratorMetadata: true, experimentalDecorators: true,
    allowSyntheticDefaultImports: true, target: 'ES2021', sourceMap: true,
    outDir: './dist', baseUrl: './', incremental: true, skipLibCheck: true,
    strictNullChecks: false, noImplicitAny: false,
  },
}, null, 2);

const nestCli = JSON.stringify({ collection: '@nestjs/schematics', sourceRoot: 'src', compilerOptions: { deleteOutDir: true } }, null, 2);

const prismaBoiler = `import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
`;

const prismaServiceBoiler = `import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}
`;

function mainTs(port, label) {
  return `import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from '@mova/shared';
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
}

function setupService(name, port, withDb) {
  const dir = `services/${name}`;
  w(`${dir}/tsconfig.json`, tsconfig);
  w(`${dir}/tsconfig.build.json`, JSON.stringify({ extends: './tsconfig.json', exclude: ['node_modules', 'test', 'dist', '**/*spec.ts'] }, null, 2));
  w(`${dir}/nest-cli.json`, nestCli);
  w(`${dir}/src/main.ts`, mainTs(port, name));
  w(`${dir}/src/health/health.module.ts`, `import { Module } from '@nestjs/common';\nimport { HealthController } from './health.controller';\n@Module({ controllers: [HealthController] })\nexport class HealthModule {}\n`);
  w(`${dir}/src/health/health.controller.ts`, healthCtrl(name, withDb));
  if (withDb) {
    w(`${dir}/src/prisma/prisma.module.ts`, prismaBoiler);
    w(`${dir}/src/prisma/prisma.service.ts`, prismaServiceBoiler);
  }
}

// === AUTH SERVICE ===
setupService('auth-service', 3001, true);
w('services/auth-service/package.json', pkg('auth-service', 3001, { '@prisma/client': '^5.22.0', prisma: '^5.22.0' }));

w('services/auth-service/prisma/schema.prisma', `generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql" url = env("DATABASE_URL") }
enum UserRole { PASSENGER DRIVER ADMIN }
enum UserStatus { ACTIVE SUSPENDED PENDING_KYC }
model User {
  id String @id @default(uuid())
  phone String @unique
  firstName String?
  lastName String?
  email String?
  role UserRole @default(PASSENGER)
  status UserStatus @default(ACTIVE)
  avatarUrl String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@map("users")
}
model OtpCode {
  id String @id @default(uuid())
  phone String
  code String
  expiresAt DateTime
  used Boolean @default(false)
  createdAt DateTime @default(now())
  @@index([phone])
  @@map("otp_codes")
}
`);

w('services/auth-service/prisma/migrations/20240612000000_init/migration.sql', `CREATE TYPE "UserRole" AS ENUM ('PASSENGER', 'DRIVER', 'ADMIN');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING_KYC');
CREATE TABLE "users" ("id" TEXT NOT NULL, "phone" TEXT NOT NULL, "firstName" TEXT, "lastName" TEXT, "email" TEXT, "role" "UserRole" NOT NULL DEFAULT 'PASSENGER', "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE', "avatarUrl" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "users_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
CREATE TABLE "otp_codes" ("id" TEXT NOT NULL, "phone" TEXT NOT NULL, "code" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "used" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id"));
CREATE INDEX "otp_codes_phone_idx" ON "otp_codes"("phone");
`);

console.log('Auth schema written');
console.log('Run node scripts/generate-services.js part2 for remaining services');
