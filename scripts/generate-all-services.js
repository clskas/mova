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
  console.log('SENGA ${label} on port ' + port);
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
// ============ AUTH SERVICE ============
setupBase('auth-service', 3001, true, { '@prisma/client': '^5.22.0', prisma: '^5.22.0' });
w('services/auth-service/src/main.ts', mainTs(3001, 'auth-service'));

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

w('services/auth-service/src/common/internal-api.guard.ts', internalGuard);
w('services/auth-service/src/auth/jwt-auth.guard.ts', jwtAuthGuard);
w('services/auth-service/src/auth/jwt.strategy.ts', jwtStrategy);

w('services/auth-service/src/auth/auth.dto.ts', `import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { UserRole } from '@prisma/client';
export class RequestOtpDto {
  @ApiProperty({ example: '+243812345678' })
  @IsString()
  phone: string;
}
export class VerifyOtpDto {
  @ApiProperty({ example: '+243812345678' })
  @IsString()
  phone: string;
  @ApiProperty({ example: '123456' })
  @IsString()
  code: string;
  @ApiProperty({ required: false, enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
`);

w('services/auth-service/src/auth/auth.controller.ts', `import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RequestOtpDto, VerifyOtpDto } from './auth.dto';
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}
  @Post('otp/request')
  @ApiOperation({ summary: 'Demander un code OTP' })
  requestOtp(@Body() dto: RequestOtpDto) { return this.authService.requestOtp(dto.phone); }
  @Post('otp/verify')
  @ApiOperation({ summary: 'Vérifier OTP et obtenir JWT' })
  verifyOtp(@Body() dto: VerifyOtpDto) { return this.authService.verifyOtp(dto.phone, dto.code, dto.role); }
}
`);

w('services/auth-service/src/auth/auth.service.ts', `import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import * as crypto from 'crypto';
import {
  MOVA_EVENTS,
  MovaErrorCode,
  MovaHttpException,
  UserCreatedPayload,
  normalizePhoneRdc,
  serviceUrl,
  validatePhoneRdc,
  INTERNAL_API_KEY,
} from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '@mova/shared';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private redis: RedisService,
  ) {}

  async requestOtp(phone: string) {
    const normalized = normalizePhoneRdc(phone);
    if (!validatePhoneRdc(normalized)) {
      throw new MovaHttpException(MovaErrorCode.AUTH_INVALID_PHONE, HttpStatus.BAD_REQUEST);
    }
    const code = this.config.get('MOCK_OTP') === 'true' ? '123456' : crypto.randomInt(100000, 999999).toString();
    await this.prisma.otpCode.create({ data: { phone: normalized, code, expiresAt: new Date(Date.now() + 10 * 60 * 1000) } });
    return { success: true, message: 'Code OTP envoyé', phone: normalized, ...(this.config.get('MOCK_OTP') === 'true' ? { mockCode: code } : {}) };
  }

  private async provisionUser(userId: string, role: UserRole) {
    const headers = { 'Content-Type': 'application/json', 'x-internal-api-key': INTERNAL_API_KEY };
    await fetch(serviceUrl('payment', '/internal/wallets'), { method: 'POST', headers, body: JSON.stringify({ userId }) });
    if (role === UserRole.DRIVER) {
      await fetch(serviceUrl('driver', '/internal/profiles'), { method: 'POST', headers, body: JSON.stringify({ userId }) });
    }
  }

  async verifyOtp(phone: string, code: string, role?: UserRole) {
    const normalized = normalizePhoneRdc(phone);
    const otp = await this.prisma.otpCode.findFirst({
      where: { phone: normalized, code, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) throw new MovaHttpException(MovaErrorCode.AUTH_INVALID_OTP);
    await this.prisma.otpCode.update({ where: { id: otp.id }, data: { used: true } });

    let user = await this.prisma.user.findUnique({ where: { phone: normalized } });
    let isNew = false;
    if (!user) {
      user = await this.prisma.user.create({ data: { phone: normalized, role: role ?? UserRole.PASSENGER } });
      isNew = true;
      await this.provisionUser(user.id, user.role);
      const payload: UserCreatedPayload = { userId: user.id, phone: user.phone, role: user.role };
      await this.redis.publish(MOVA_EVENTS.USER_CREATED, payload);
    }
    if (role === UserRole.DRIVER && user.role !== UserRole.DRIVER) {
      user = await this.prisma.user.update({ where: { id: user.id }, data: { role: UserRole.DRIVER } });
      await fetch(serviceUrl('driver', '/internal/profiles'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-api-key': INTERNAL_API_KEY },
        body: JSON.stringify({ userId: user.id }),
      });
    }
    const token = this.jwt.sign({ sub: user.id, phone: user.phone, role: user.role });
    return { success: true, accessToken: token, isNew, user: { id: user.id, phone: user.phone, role: user.role, firstName: user.firstName, lastName: user.lastName } };
  }

  async validateUser(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }
}
`);

w('services/auth-service/src/auth/auth.module.ts', `import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({ secret: config.get('JWT_SECRET') ?? 'dev_secret', signOptions: { expiresIn: config.get('JWT_EXPIRES_IN') ?? '7d' } }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
`);

w('services/auth-service/src/users/users.service.ts', `import { HttpStatus, Injectable } from '@nestjs/common';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}
  async findById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new MovaHttpException(MovaErrorCode.USER_NOT_FOUND, HttpStatus.NOT_FOUND);
    return user;
  }
  async updateProfile(id: string, data: { firstName?: string; lastName?: string; email?: string }) {
    return this.prisma.user.update({ where: { id }, data });
  }
  async listUsers(skip = 0, take = 50) {
    return this.prisma.user.findMany({ skip, take, orderBy: { createdAt: 'desc' } });
  }
}
`);

w('services/auth-service/src/users/users.controller.ts', `import { Body, Controller, Get, Patch, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';
class UpdateProfileDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() firstName?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() lastName?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsEmail() email?: string;
}
@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private usersService: UsersService) {}
  @Get('me')
  @ApiOperation({ summary: 'Profil utilisateur' })
  me(@Request() req: { user: { id: string } }) { return this.usersService.findById(req.user.id); }
  @Patch('me')
  @ApiOperation({ summary: 'Mettre à jour profil' })
  update(@Request() req: { user: { id: string } }, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(req.user.id, dto);
  }
}
`);

w('services/auth-service/src/users/users.module.ts', `import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
@Module({ controllers: [UsersController], providers: [UsersService], exports: [UsersService] })
export class UsersModule {}
`);

w('services/auth-service/src/internal/internal.controller.ts', `import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { InternalApiGuard } from '../common/internal-api.guard';
@Controller('internal')
@UseGuards(InternalApiGuard)
export class InternalController {
  constructor(private users: UsersService) {}
  @Get('users/count')
  async count() { const users = await this.users.listUsers(0, 10000); return { count: users.length }; }
  @Get('users')
  list(@Query('skip') skip?: string, @Query('take') take?: string) { return this.users.listUsers(Number(skip ?? 0), Number(take ?? 50)); }
  @Get('users/:id')
  get(@Param('id') id: string) { return this.users.findById(id); }
}
`);

w('services/auth-service/src/internal/internal.module.ts', `import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { UsersModule } from '../users/users.module';
@Module({ imports: [UsersModule], controllers: [InternalController] })
export class InternalModule {}
`);

w('services/auth-service/src/app.module.ts', `import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from '@mova/shared';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { InternalModule } from './internal/internal.module';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RedisModule,
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    InternalModule,
  ],
})
export class AppModule {}
`);

// ============ PAYMENT SERVICE ============
setupBase('payment-service', 3003, true, { '@prisma/client': '^5.22.0', prisma: '^5.22.0' });
w('services/payment-service/src/main.ts', mainTs(3003, 'payment-service'));
w('services/payment-service/prisma/schema.prisma', `generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql" url = env("DATABASE_URL") }
enum PaymentMethod { WALLET ORANGE_MONEY MPESA AIRTEL_MONEY CASH }
enum PaymentStatus { PENDING COMPLETED FAILED REFUNDED }
model Payment {
  id String @id @default(uuid())
  rideId String @unique
  userId String
  amountCdf Int
  method PaymentMethod
  status PaymentStatus @default(PENDING)
  providerRef String?
  failureReason String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@map("payments")
}
model Wallet {
  id String @id @default(uuid())
  userId String @unique
  balanceCdf Int @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  transactions WalletTransaction[]
  @@map("wallets")
}
model WalletTransaction {
  id String @id @default(uuid())
  walletId String
  wallet Wallet @relation(fields: [walletId], references: [id], onDelete: Cascade)
  amountCdf Int
  type String
  description String?
  reference String?
  createdAt DateTime @default(now())
  @@index([walletId])
  @@map("wallet_transactions")
}
`);
w('services/payment-service/prisma/migrations/20240612000000_init/migration.sql', `CREATE TYPE "PaymentMethod" AS ENUM ('WALLET', 'ORANGE_MONEY', 'MPESA', 'AIRTEL_MONEY', 'CASH');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');
CREATE TABLE "payments" ("id" TEXT NOT NULL, "rideId" TEXT NOT NULL, "userId" TEXT NOT NULL, "amountCdf" INTEGER NOT NULL, "method" "PaymentMethod" NOT NULL, "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING', "providerRef" TEXT, "failureReason" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "payments_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "payments_rideId_key" ON "payments"("rideId");
CREATE TABLE "wallets" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "balanceCdf" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "wallets_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "wallets_userId_key" ON "wallets"("userId");
CREATE TABLE "wallet_transactions" ("id" TEXT NOT NULL, "walletId" TEXT NOT NULL, "amountCdf" INTEGER NOT NULL, "type" TEXT NOT NULL, "description" TEXT, "reference" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id"));
CREATE INDEX "wallet_transactions_walletId_idx" ON "wallet_transactions"("walletId");
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
`);
w('services/payment-service/src/common/internal-api.guard.ts', internalGuard);
w('services/payment-service/src/auth/jwt-auth.guard.ts', jwtAuthGuard);
w('services/payment-service/src/auth/jwt.strategy.ts', jwtStrategy);
w('services/payment-service/src/payments/payment-provider.interface.ts', `export interface PaymentInitResult {
  success: boolean;
  transactionId?: string;
  providerRef?: string;
  message?: string;
}
export interface PaymentProvider {
  readonly name: string;
  initiatePayment(amountCdf: number, phone: string, reference: string): Promise<PaymentInitResult>;
  verifyPayment(providerRef: string): Promise<boolean>;
}
`);
w('services/payment-service/src/payments/payment-providers.ts', `import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentInitResult, PaymentProvider } from './payment-provider.interface';
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'MOCK';
  private readonly logger = new Logger(MockPaymentProvider.name);
  constructor(private config: ConfigService) {}
  async initiatePayment(amountCdf: number, phone: string, reference: string): Promise<PaymentInitResult> {
    this.logger.log(\`[MOCK] Payment \${amountCdf} CDF from \${phone} ref=\${reference}\`);
    return { success: true, transactionId: \`MOCK-\${Date.now()}\`, providerRef: \`mock_\${reference}\`, message: 'Paiement simulé avec succès' };
  }
  async verifyPayment(providerRef: string) { return providerRef.startsWith('mock_'); }
}
@Injectable()
export class OrangeMoneyProvider implements PaymentProvider {
  readonly name = 'ORANGE_MONEY';
  async initiatePayment() { return { success: false, transactionId: '', message: 'Orange Money API non configurée' }; }
  async verifyPayment() { return false; }
}
@Injectable()
export class MpesaProvider implements PaymentProvider {
  readonly name = 'MPESA';
  async initiatePayment() { return { success: false, transactionId: '', message: 'M-Pesa API non configurée' }; }
  async verifyPayment() { return false; }
}
@Injectable()
export class AirtelMoneyProvider implements PaymentProvider {
  readonly name = 'AIRTEL_MONEY';
  async initiatePayment() { return { success: false, transactionId: '', message: 'Airtel Money API non configurée' }; }
  async verifyPayment() { return false; }
}
`);
w('services/payment-service/src/wallet/wallet.service.ts', `import { Injectable } from '@nestjs/common';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService) {}
  async createWallet(userId: string) {
    return this.prisma.wallet.upsert({ where: { userId }, create: { userId, balanceCdf: 0 }, update: {} });
  }
  async getWallet(userId: string) {
    let wallet = await this.prisma.wallet.findUnique({ where: { userId }, include: { transactions: { orderBy: { createdAt: 'desc' }, take: 20 } } });
    if (!wallet) wallet = await this.createWallet(userId);
    return wallet;
  }
  async credit(userId: string, amountCdf: number, description: string) {
    const wallet = await this.getWallet(userId);
    const updated = await this.prisma.wallet.update({ where: { id: wallet.id }, data: { balanceCdf: { increment: amountCdf } } });
    await this.prisma.walletTransaction.create({ data: { walletId: wallet.id, amountCdf, type: 'CREDIT', description } });
    return updated;
  }
  async debit(userId: string, amountCdf: number, description: string) {
    const wallet = await this.getWallet(userId);
    if (wallet.balanceCdf < amountCdf) throw new MovaHttpException(MovaErrorCode.PAYMENT_INSUFFICIENT_BALANCE);
    const updated = await this.prisma.wallet.update({ where: { id: wallet.id }, data: { balanceCdf: { decrement: amountCdf } } });
    await this.prisma.walletTransaction.create({ data: { walletId: wallet.id, amountCdf: -amountCdf, type: 'DEBIT', description } });
    return updated;
  }
}
`);
w('services/payment-service/src/wallet/wallet.controller.ts', `import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WalletService } from './wallet.service';
class WithdrawDto {
  @ApiProperty() @IsInt() @Min(100) amountCdf: number;
  @ApiProperty() @IsString() provider: string;
  @ApiProperty() @IsString() phone: string;
}
@ApiTags('wallet')
@Controller('wallet')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WalletController {
  constructor(private walletService: WalletService) {}
  @Get()
  @ApiOperation({ summary: 'Solde portefeuille CDF' })
  get(@Request() req: { user: { id: string } }) { return this.walletService.getWallet(req.user.id); }
  @Post('withdraw')
  @ApiOperation({ summary: 'Retrait mobile money' })
  async withdraw(@Request() req: { user: { id: string } }, @Body() dto: WithdrawDto) {
    await this.walletService.debit(req.user.id, dto.amountCdf, \`Retrait \${dto.provider} vers \${dto.phone}\`);
    return { success: true, message: \`Retrait de \${dto.amountCdf} FC en cours\`, amountCdf: dto.amountCdf };
  }
}
`);
w('services/payment-service/src/wallet/wallet.module.ts', `import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
@Module({ controllers: [WalletController], providers: [WalletService], exports: [WalletService] })
export class WalletModule {}
`);
w('services/payment-service/src/payments/payments.dto.ts', `import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { PaymentMethod } from '@prisma/client';
export class ProcessPaymentDto {
  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;
  @ApiProperty()
  @IsString()
  phone: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  amountCdf?: number;
}
`);
w('services/payment-service/src/payments/payments.service.ts', `import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import {
  MOVA_EVENTS,
  MovaErrorCode,
  MovaHttpException,
  PaymentCompletedPayload,
  INTERNAL_API_KEY,
  serviceUrl,
} from '@mova/shared';
import { RedisService } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { AirtelMoneyProvider, MockPaymentProvider, MpesaProvider, OrangeMoneyProvider } from './payment-providers';
import { PaymentProvider } from './payment-provider.interface';

@Injectable()
export class PaymentsService {
  private providers: Map<PaymentMethod, PaymentProvider>;
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private walletService: WalletService,
    private redis: RedisService,
    mock: MockPaymentProvider,
    orange: OrangeMoneyProvider,
    mpesa: MpesaProvider,
    airtel: AirtelMoneyProvider,
  ) {
    this.providers = new Map([
      [PaymentMethod.ORANGE_MONEY, orange],
      [PaymentMethod.MPESA, mpesa],
      [PaymentMethod.AIRTEL_MONEY, airtel],
    ]);
    if (config.get('MOCK_PAYMENTS') === 'true') this.providers.set(PaymentMethod.WALLET, mock);
  }
  private getProvider(method: PaymentMethod): PaymentProvider {
    if (method === PaymentMethod.WALLET) return this.providers.get(PaymentMethod.WALLET) ?? new MockPaymentProvider(this.config);
    const provider = this.providers.get(method);
    if (!provider) throw new MovaHttpException(MovaErrorCode.PAYMENT_INVALID_METHOD);
    if (this.config.get('MOCK_PAYMENTS') === 'true') return new MockPaymentProvider(this.config);
    return provider;
  }
  private async fetchRide(rideId: string) {
    const res = await fetch(serviceUrl('ride', \`/internal/rides/\${rideId}\`), { headers: { 'x-internal-api-key': INTERNAL_API_KEY } });
    if (!res.ok) throw new MovaHttpException(MovaErrorCode.RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    return res.json();
  }
  async processPayment(rideId: string, userId: string, amountCdf: number, method: PaymentMethod, phone: string) {
    const provider = this.getProvider(method);
    const result = await provider.initiatePayment(amountCdf, phone, rideId);
    const payment = await this.prisma.payment.upsert({
      where: { rideId },
      create: { rideId, userId, amountCdf, method, status: result.success ? PaymentStatus.COMPLETED : PaymentStatus.FAILED, providerRef: result.providerRef, failureReason: result.success ? null : result.message },
      update: { status: result.success ? PaymentStatus.COMPLETED : PaymentStatus.FAILED, providerRef: result.providerRef, failureReason: result.success ? null : result.message },
    });
    if (!result.success) throw new MovaHttpException(MovaErrorCode.PAYMENT_FAILED);
    await this.redis.publish(MOVA_EVENTS.PAYMENT_COMPLETED, { rideId, userId, amountCdf, method } as PaymentCompletedPayload);
    return { payment, ...result };
  }
  async payRide(rideId: string, userId: string, method: PaymentMethod, phone: string, amountOverride?: number) {
    const ride = await this.fetchRide(rideId);
    if (ride.passengerId !== userId) throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    if (ride.status !== 'COMPLETED') throw new MovaHttpException(MovaErrorCode.RIDE_INVALID_STATUS);
    const amountCdf = amountOverride ?? ride.finalFareCdf ?? ride.estimatedFareCdf ?? 0;
    if (amountCdf <= 0) throw new MovaHttpException(MovaErrorCode.PAYMENT_FAILED);
    if (method === PaymentMethod.WALLET) {
      await this.walletService.debit(userId, amountCdf, \`Paiement course \${rideId}\`);
      const payment = await this.prisma.payment.upsert({
        where: { rideId },
        create: { rideId, userId, amountCdf, method, status: PaymentStatus.COMPLETED, providerRef: \`wallet_\${rideId}\` },
        update: { status: PaymentStatus.COMPLETED, method, amountCdf },
      });
      await this.redis.publish(MOVA_EVENTS.PAYMENT_COMPLETED, { rideId, userId, amountCdf, method: method.toString() });
      return { success: true, payment, message: 'Paiement portefeuille effectué' };
    }
    if (method === PaymentMethod.CASH) {
      const payment = await this.prisma.payment.upsert({
        where: { rideId },
        create: { rideId, userId, amountCdf, method, status: PaymentStatus.COMPLETED, providerRef: \`cash_\${rideId}\` },
        update: { status: PaymentStatus.COMPLETED, method, amountCdf },
      });
      await this.redis.publish(MOVA_EVENTS.PAYMENT_COMPLETED, { rideId, userId, amountCdf, method: 'CASH' });
      return { success: true, payment, message: 'Paiement espèces enregistré' };
    }
    return this.processPayment(rideId, userId, amountCdf, method, phone);
  }
}
`);
w('services/payment-service/src/payments/payments.controller.ts', `import { Body, Controller, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProcessPaymentDto } from './payments.dto';
import { PaymentsService } from './payments.service';
@ApiTags('payments')
@Controller('payments')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}
  @Post('rides/:rideId')
  @ApiOperation({ summary: 'Payer une course' })
  payRide(@Request() req: { user: { id: string } }, @Param('rideId') rideId: string, @Body() dto: ProcessPaymentDto) {
    return this.paymentsService.payRide(rideId, req.user.id, dto.method, dto.phone, dto.amountCdf);
  }
}
`);
w('services/payment-service/src/payments/payments.module.ts', `import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { WalletModule } from '../wallet/wallet.module';
import { AirtelMoneyProvider, MockPaymentProvider, MpesaProvider, OrangeMoneyProvider } from './payment-providers';
@Module({
  imports: [WalletModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, MockPaymentProvider, OrangeMoneyProvider, MpesaProvider, AirtelMoneyProvider],
})
export class PaymentsModule {}
`);
w('services/payment-service/src/internal/internal.controller.ts', `import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsString } from 'class-validator';
import { WalletService } from '../wallet/wallet.service';
import { InternalApiGuard } from '../common/internal-api.guard';
class CreateWalletDto { @IsString() userId: string; }
@Controller('internal')
@UseGuards(InternalApiGuard)
export class InternalController {
  constructor(private wallet: WalletService) {}
  @Post('wallets')
  create(@Body() dto: CreateWalletDto) { return this.wallet.createWallet(dto.userId); }
}
`);
w('services/payment-service/src/internal/internal.module.ts', `import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { WalletModule } from '../wallet/wallet.module';
@Module({ imports: [WalletModule], controllers: [InternalController] })
export class InternalModule {}
`);
w('services/payment-service/src/app.module.ts', `import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from '@mova/shared';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { WalletModule } from './wallet/wallet.module';
import { PaymentsModule } from './payments/payments.module';
import { InternalModule } from './internal/internal.module';
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), RedisModule, PrismaModule, HealthModule, WalletModule, PaymentsModule, InternalModule],
})
export class AppModule {}
`);

console.log('Payment service written');

// ============ DRIVER SERVICE ============
setupBase('driver-service', 3004, true, { '@prisma/client': '^5.22.0', prisma: '^5.22.0' });
w('services/driver-service/src/main.ts', mainTs(3004, 'driver-service'));
w('services/driver-service/prisma/schema.prisma', `generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql" url = env("DATABASE_URL") }
enum VehicleType { MOTO_TAXI STANDARD COMFORT }
enum KycStatus { PENDING APPROVED REJECTED }
enum IncidentType { ACCIDENT HARASSMENT FRAUD OTHER }
model DriverProfile {
  id String @id @default(uuid())
  userId String @unique
  licenseNumber String?
  isAvailable Boolean @default(false)
  currentLat Float?
  currentLng Float?
  ratingAvg Float @default(5.0)
  totalRides Int @default(0)
  kycStatus KycStatus @default(PENDING)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  vehicles Vehicle[]
  @@map("driver_profiles")
}
model Vehicle {
  id String @id @default(uuid())
  driverProfileId String
  driverProfile DriverProfile @relation(fields: [driverProfileId], references: [id], onDelete: Cascade)
  type VehicleType
  make String?
  model String?
  plateNumber String
  color String?
  isActive Boolean @default(true)
  createdAt DateTime @default(now())
  @@map("vehicles")
}
model KycDocument {
  id String @id @default(uuid())
  userId String
  type String
  url String
  status KycStatus @default(PENDING)
  notes String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([userId])
  @@map("kyc_documents")
}
model Incident {
  id String @id @default(uuid())
  userId String
  rideId String?
  type IncidentType
  description String
  status String @default("OPEN")
  createdAt DateTime @default(now())
  @@map("incidents")
}
`);
w('services/driver-service/prisma/migrations/20240612000000_init/migration.sql', `CREATE TYPE "VehicleType" AS ENUM ('MOTO_TAXI', 'STANDARD', 'COMFORT');
CREATE TYPE "KycStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "IncidentType" AS ENUM ('ACCIDENT', 'HARASSMENT', 'FRAUD', 'OTHER');
CREATE TABLE "driver_profiles" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "licenseNumber" TEXT, "isAvailable" BOOLEAN NOT NULL DEFAULT false, "currentLat" DOUBLE PRECISION, "currentLng" DOUBLE PRECISION, "ratingAvg" DOUBLE PRECISION NOT NULL DEFAULT 5.0, "totalRides" INTEGER NOT NULL DEFAULT 0, "kycStatus" "KycStatus" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "driver_profiles_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "driver_profiles_userId_key" ON "driver_profiles"("userId");
CREATE TABLE "vehicles" ("id" TEXT NOT NULL, "driverProfileId" TEXT NOT NULL, "type" "VehicleType" NOT NULL, "make" TEXT, "model" TEXT, "plateNumber" TEXT NOT NULL, "color" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id"));
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_driverProfileId_fkey" FOREIGN KEY ("driverProfileId") REFERENCES "driver_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "kyc_documents" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "type" TEXT NOT NULL, "url" TEXT NOT NULL, "status" "KycStatus" NOT NULL DEFAULT 'PENDING', "notes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "kyc_documents_pkey" PRIMARY KEY ("id"));
CREATE INDEX "kyc_documents_userId_idx" ON "kyc_documents"("userId");
CREATE TABLE "incidents" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "rideId" TEXT, "type" "IncidentType" NOT NULL, "description" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'OPEN', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "incidents_pkey" PRIMARY KEY ("id"));
`);
w('services/driver-service/src/common/internal-api.guard.ts', internalGuard);
w('services/driver-service/src/auth/jwt-auth.guard.ts', jwtAuthGuard);
w('services/driver-service/src/auth/jwt.strategy.ts', jwtStrategy);
w('services/driver-service/src/drivers/drivers.service.ts', `import { Injectable, Logger } from '@nestjs/common';
import { KycStatus, VehicleType } from '@prisma/client';
import { MARKET_RDC, MovaErrorCode, MovaHttpException, INTERNAL_API_KEY, serviceUrl } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';

export interface DriverCandidate {
  driverId: string;
  userId: string;
  lat: number;
  lng: number;
  rating: number;
  distanceKm: number;
  score: number;
  vehicleId?: string;
}

@Injectable()
export class DriversService {
  private readonly logger = new Logger(DriversService.name);
  constructor(private prisma: PrismaService) {}

  async createProfile(userId: string) {
    return this.prisma.driverProfile.upsert({ where: { userId }, create: { userId }, update: {} });
  }

  async findNearby(lat: number, lng: number, vehicleType: VehicleType, searchAttempt = 0): Promise<DriverCandidate[]> {
    const effectiveRadius = Math.min(
      MARKET_RDC.matching.initialRadiusKm + searchAttempt * MARKET_RDC.matching.radiusIncrementKm,
      MARKET_RDC.matching.maxRadiusKm,
    );
    const drivers = await this.prisma.driverProfile.findMany({
      where: { isAvailable: true, kycStatus: KycStatus.APPROVED, currentLat: { not: null }, currentLng: { not: null }, vehicles: { some: { type: vehicleType, isActive: true } } },
      include: { vehicles: { where: { type: vehicleType, isActive: true } } },
    });
    const candidates: DriverCandidate[] = [];
    for (const driver of drivers) {
      if (driver.currentLat == null || driver.currentLng == null) continue;
      const distanceKm = this.haversineKm(lat, lng, driver.currentLat, driver.currentLng);
      if (distanceKm > effectiveRadius) continue;
      candidates.push({
        driverId: driver.id,
        userId: driver.userId,
        lat: driver.currentLat,
        lng: driver.currentLng,
        rating: driver.ratingAvg,
        distanceKm,
        score: this.computeScore(distanceKm, driver.ratingAvg),
        vehicleId: driver.vehicles[0]?.id,
      });
    }
    return candidates.sort((a, b) => b.score - a.score);
  }

  async setAvailability(userId: string, isAvailable: boolean) {
    const profile = await this.prisma.driverProfile.findUnique({ where: { userId } });
    if (!profile) throw new MovaHttpException(MovaErrorCode.DRIVER_KYC_PENDING);
    if (profile.kycStatus !== KycStatus.APPROVED && isAvailable) throw new MovaHttpException(MovaErrorCode.DRIVER_KYC_PENDING);
    return this.prisma.driverProfile.update({ where: { userId }, data: { isAvailable } });
  }

  async updateLocation(userId: string, lat: number, lng: number) {
    return this.prisma.driverProfile.update({ where: { userId }, data: { currentLat: lat, currentLng: lng } });
  }

  async uploadKyc(userId: string, type: string, url: string) {
    await this.prisma.kycDocument.create({ data: { userId, type, url } });
    return this.prisma.driverProfile.upsert({ where: { userId }, create: { userId, kycStatus: KycStatus.PENDING }, update: { kycStatus: KycStatus.PENDING } });
  }

  async getProfile(userId: string) {
    return this.prisma.driverProfile.findUnique({ where: { userId }, include: { vehicles: true } });
  }

  async getEarnings(userId: string) {
    const res = await fetch(serviceUrl('ride', \`/internal/rides/driver/\${userId}/earnings\`), { headers: { 'x-internal-api-key': INTERNAL_API_KEY } });
    if (!res.ok) return { totalCdf: 0, todayCdf: 0, weekCdf: 0, monthCdf: 0, rideCount: 0 };
    return res.json();
  }

  async pendingKyc() {
    return this.prisma.kycDocument.findMany({ where: { status: KycStatus.PENDING }, orderBy: { createdAt: 'desc' } });
  }

  async approveKyc(documentId: string, approved: boolean, notes?: string) {
    const doc = await this.prisma.kycDocument.update({ where: { id: documentId }, data: { status: approved ? KycStatus.APPROVED : KycStatus.REJECTED, notes } });
    if (approved) await this.prisma.driverProfile.update({ where: { userId: doc.userId }, data: { kycStatus: KycStatus.APPROVED } });
    return doc;
  }

  async updateRating(userId: string, ratingAvg: number) {
    return this.prisma.driverProfile.update({ where: { userId }, data: { ratingAvg } });
  }

  async countDrivers() {
    return this.prisma.driverProfile.count();
  }

  private computeScore(distanceKm: number, rating: number): number {
    const w = MARKET_RDC.matching.scoreWeights;
    const distanceScore = Math.max(0, 1 - distanceKm / 10);
    const ratingScore = rating / 5;
    return w.distance * distanceScore + w.rating * ratingScore + w.acceptanceRate * 0.9 + w.waitTime * 1;
  }

  private haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
`);
w('services/driver-service/src/drivers/drivers.controller.ts', `import { Body, Controller, Get, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DriversService } from './drivers.service';
class AvailabilityDto { @ApiProperty() @IsBoolean() isAvailable: boolean; }
class LocationDto { @ApiProperty() @IsNumber() lat: number; @ApiProperty() @IsNumber() lng: number; }
class KycUploadDto { @ApiProperty() @IsString() type: string; @ApiProperty() @IsString() url: string; }
@ApiTags('drivers')
@Controller('drivers')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DriversController {
  constructor(private driversService: DriversService) {}
  @Patch('availability') availability(@Request() req: { user: { id: string } }, @Body() dto: AvailabilityDto) { return this.driversService.setAvailability(req.user.id, dto.isAvailable); }
  @Post('location') location(@Request() req: { user: { id: string } }, @Body() dto: LocationDto) { return this.driversService.updateLocation(req.user.id, dto.lat, dto.lng); }
  @Post('kyc') kyc(@Request() req: { user: { id: string } }, @Body() dto: KycUploadDto) { return this.driversService.uploadKyc(req.user.id, dto.type, dto.url); }
  @Get('earnings') earnings(@Request() req: { user: { id: string } }) { return this.driversService.getEarnings(req.user.id); }
  @Get('profile') profile(@Request() req: { user: { id: string } }) { return this.driversService.getProfile(req.user.id); }
}
`);
w('services/driver-service/src/drivers/drivers.module.ts', `import { Module } from '@nestjs/common';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
@Module({ controllers: [DriversController], providers: [DriversService], exports: [DriversService] })
export class DriversModule {}
`);
w('services/driver-service/src/incidents/incidents.service.ts', `import { Injectable } from '@nestjs/common';
import { IncidentType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
@Injectable()
export class IncidentsService {
  constructor(private prisma: PrismaService) {}
  async create(userId: string, type: IncidentType, description: string, rideId?: string) {
    return this.prisma.incident.create({ data: { userId, type, description, rideId } });
  }
  async list() { return this.prisma.incident.findMany({ orderBy: { createdAt: 'desc' } }); }
  async resolve(id: string, status: string) { return this.prisma.incident.update({ where: { id }, data: { status } }); }
  async countOpen() { return this.prisma.incident.count({ where: { status: 'OPEN' } }); }
}
`);
w('services/driver-service/src/incidents/incidents.controller.ts', `import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { IncidentType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IncidentsService } from './incidents.service';
class CreateIncidentDto {
  @ApiProperty({ enum: IncidentType }) @IsEnum(IncidentType) type: IncidentType;
  @ApiProperty() @IsString() description: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() rideId?: string;
}
@ApiTags('incidents')
@Controller('incidents')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class IncidentsController {
  constructor(private incidents: IncidentsService) {}
  @Post()
  @ApiOperation({ summary: 'Signaler un incident' })
  create(@Request() req: { user: { id: string } }, @Body() dto: CreateIncidentDto) {
    return this.incidents.create(req.user.id, dto.type, dto.description, dto.rideId);
  }
}
`);
w('services/driver-service/src/incidents/incidents.module.ts', `import { Module } from '@nestjs/common';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';
@Module({ controllers: [IncidentsController], providers: [IncidentsService], exports: [IncidentsService] })
export class IncidentsModule {}
`);
w('services/driver-service/src/internal/internal.controller.ts', `import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { VehicleType } from '@prisma/client';
import { DriversService } from '../drivers/drivers.service';
import { IncidentsService } from '../incidents/incidents.service';
import { InternalApiGuard } from '../common/internal-api.guard';
class CreateProfileDto { @IsString() userId: string; }
class NearbyQuery {
  @Type(() => Number) @IsNumber() lat: number;
  @Type(() => Number) @IsNumber() lng: number;
  @IsString() vehicleType: VehicleType;
  @IsOptional() @Type(() => Number) @IsNumber() searchAttempt?: number;
}
class RatingDto { @IsNumber() ratingAvg: number; }
class ReviewKycDto { approved: boolean; notes?: string; }
@Controller('internal')
@UseGuards(InternalApiGuard)
export class InternalController {
  constructor(private drivers: DriversService, private incidents: IncidentsService) {}
  @Post('profiles') createProfile(@Body() dto: CreateProfileDto) { return this.drivers.createProfile(dto.userId); }
  @Get('drivers/nearby') nearby(@Query() q: NearbyQuery) {
    return this.drivers.findNearby(q.lat, q.lng, q.vehicleType as VehicleType, q.searchAttempt ?? 0);
  }
  @Get('drivers/count') count() { return this.drivers.countDrivers().then((count) => ({ count })); }
  @Get('kyc/pending') pendingKyc() { return this.drivers.pendingKyc(); }
  @Post('kyc/:id/review') reviewKyc(@Param('id') id: string, @Body() dto: ReviewKycDto) { return this.drivers.approveKyc(id, dto.approved, dto.notes); }
  @Patch('drivers/:userId/rating') updateRating(@Param('userId') userId: string, @Body() dto: RatingDto) { return this.drivers.updateRating(userId, dto.ratingAvg); }
  @Patch('drivers/:userId/location') updateLocation(@Param('userId') userId: string, @Body() dto: { lat: number; lng: number }) { return this.drivers.updateLocation(userId, dto.lat, dto.lng); }
  @Get('incidents') listIncidents() { return this.incidents.list(); }
  @Post('incidents/:id/resolve') resolve(@Param('id') id: string, @Body('status') status: string) { return this.incidents.resolve(id, status ?? 'RESOLVED'); }
}
`);
w('services/driver-service/src/internal/internal.module.ts', `import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { DriversModule } from '../drivers/drivers.module';
import { IncidentsModule } from '../incidents/incidents.module';
@Module({ imports: [DriversModule, IncidentsModule], controllers: [InternalController] })
export class InternalModule {}
`);
w('services/driver-service/src/app.module.ts', `import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { DriversModule } from './drivers/drivers.module';
import { IncidentsModule } from './incidents/incidents.module';
import { InternalModule } from './internal/internal.module';
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, HealthModule, DriversModule, IncidentsModule, InternalModule],
})
export class AppModule {}
`);

console.log('Driver service written');

// ============ RIDE SERVICE ============
setupBase('ride-service', 3002, true, {
  '@prisma/client': '^5.22.0',
  prisma: '^5.22.0',
  '@nestjs/platform-socket.io': '^10.0.0',
  '@nestjs/websockets': '^10.0.0',
  'socket.io': '^4.7.5',
});
w('services/ride-service/src/main.ts', `import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from '@mova/shared';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new IoAdapter(app));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',') ?? '*', credentials: true });
  app.setGlobalPrefix('api', { exclude: ['health', 'internal/(.*)'] });
  const port = process.env.PORT ?? 3002;
  await app.listen(port);
  console.log('SENGA ride-service on port ' + port);
}
bootstrap();
`);
w('services/ride-service/prisma/schema.prisma', `generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql" url = env("DATABASE_URL") }
enum VehicleType { MOTO_TAXI STANDARD COMFORT }
enum RideStatus { REQUESTED SEARCHING ACCEPTED DRIVER_ARRIVED IN_PROGRESS COMPLETED CANCELLED }
model Commune {
  id String @id @default(uuid())
  name String @unique
  city String @default("Kinshasa")
  lat Float
  lng Float
  createdAt DateTime @default(now())
  @@map("communes")
}
model PricingRule {
  id String @id @default(uuid())
  vehicleType VehicleType @unique
  baseFareCdf Int
  perKmCdf Int
  perMinuteCdf Int
  minFareCdf Int
  peakMultiplier Float @default(1.0)
  nightMultiplier Float @default(1.0)
  isActive Boolean @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@map("pricing_rules")
}
model CancellationPolicy {
  id String @id @default(uuid())
  vehicleType VehicleType @unique
  freeCancelMinutes Int @default(2)
  passengerFeeCdf Int @default(0)
  driverCompensationCdf Int @default(0)
  noShowFeeCdf Int @default(2000)
  createdAt DateTime @default(now())
  @@map("cancellation_policies")
}
model Ride {
  id String @id @default(uuid())
  passengerId String
  driverId String?
  vehicleId String?
  status RideStatus @default(REQUESTED)
  vehicleType VehicleType
  pickupLat Float
  pickupLng Float
  pickupAddress String?
  dropoffLat Float
  dropoffLng Float
  dropoffAddress String?
  estimatedFareCdf Int?
  finalFareCdf Int?
  distanceKm Float?
  durationMin Float?
  acceptedAt DateTime?
  startedAt DateTime?
  completedAt DateTime?
  cancelledAt DateTime?
  cancelReason String?
  cancelledBy String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  events RideEvent[]
  ratings Rating[]
  @@index([status])
  @@index([passengerId])
  @@index([driverId])
  @@map("rides")
}
model RideEvent {
  id String @id @default(uuid())
  rideId String
  ride Ride @relation(fields: [rideId], references: [id], onDelete: Cascade)
  event String
  lat Float?
  lng Float?
  metadata Json?
  createdAt DateTime @default(now())
  @@index([rideId])
  @@map("ride_events")
}
model Rating {
  id String @id @default(uuid())
  rideId String
  ride Ride @relation(fields: [rideId], references: [id])
  fromUserId String
  toUserId String
  score Int
  comment String?
  createdAt DateTime @default(now())
  @@unique([rideId, fromUserId])
  @@map("ratings")
}
`);
w('services/ride-service/prisma/migrations/20240612000000_init/migration.sql', `CREATE TYPE "VehicleType" AS ENUM ('MOTO_TAXI', 'STANDARD', 'COMFORT');
CREATE TYPE "RideStatus" AS ENUM ('REQUESTED', 'SEARCHING', 'ACCEPTED', 'DRIVER_ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TABLE "communes" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "city" TEXT NOT NULL DEFAULT 'Kinshasa', "lat" DOUBLE PRECISION NOT NULL, "lng" DOUBLE PRECISION NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "communes_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "communes_name_key" ON "communes"("name");
CREATE TABLE "pricing_rules" ("id" TEXT NOT NULL, "vehicleType" "VehicleType" NOT NULL, "baseFareCdf" INTEGER NOT NULL, "perKmCdf" INTEGER NOT NULL, "perMinuteCdf" INTEGER NOT NULL, "minFareCdf" INTEGER NOT NULL, "peakMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0, "nightMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0, "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "pricing_rules_vehicleType_key" ON "pricing_rules"("vehicleType");
CREATE TABLE "cancellation_policies" ("id" TEXT NOT NULL, "vehicleType" "VehicleType" NOT NULL, "freeCancelMinutes" INTEGER NOT NULL DEFAULT 2, "passengerFeeCdf" INTEGER NOT NULL DEFAULT 0, "driverCompensationCdf" INTEGER NOT NULL DEFAULT 0, "noShowFeeCdf" INTEGER NOT NULL DEFAULT 2000, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "cancellation_policies_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "cancellation_policies_vehicleType_key" ON "cancellation_policies"("vehicleType");
CREATE TABLE "rides" ("id" TEXT NOT NULL, "passengerId" TEXT NOT NULL, "driverId" TEXT, "vehicleId" TEXT, "status" "RideStatus" NOT NULL DEFAULT 'REQUESTED', "vehicleType" "VehicleType" NOT NULL, "pickupLat" DOUBLE PRECISION NOT NULL, "pickupLng" DOUBLE PRECISION NOT NULL, "pickupAddress" TEXT, "dropoffLat" DOUBLE PRECISION NOT NULL, "dropoffLng" DOUBLE PRECISION NOT NULL, "dropoffAddress" TEXT, "estimatedFareCdf" INTEGER, "finalFareCdf" INTEGER, "distanceKm" DOUBLE PRECISION, "durationMin" DOUBLE PRECISION, "acceptedAt" TIMESTAMP(3), "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3), "cancelledAt" TIMESTAMP(3), "cancelReason" TEXT, "cancelledBy" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "rides_pkey" PRIMARY KEY ("id"));
CREATE INDEX "rides_status_idx" ON "rides"("status");
CREATE INDEX "rides_passengerId_idx" ON "rides"("passengerId");
CREATE INDEX "rides_driverId_idx" ON "rides"("driverId");
CREATE TABLE "ride_events" ("id" TEXT NOT NULL, "rideId" TEXT NOT NULL, "event" TEXT NOT NULL, "lat" DOUBLE PRECISION, "lng" DOUBLE PRECISION, "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ride_events_pkey" PRIMARY KEY ("id"));
CREATE INDEX "ride_events_rideId_idx" ON "ride_events"("rideId");
ALTER TABLE "ride_events" ADD CONSTRAINT "ride_events_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "ratings" ("id" TEXT NOT NULL, "rideId" TEXT NOT NULL, "fromUserId" TEXT NOT NULL, "toUserId" TEXT NOT NULL, "score" INTEGER NOT NULL, "comment" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ratings_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "ratings_rideId_fromUserId_key" ON "ratings"("rideId", "fromUserId");
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "rides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
`);
w('services/ride-service/prisma/seed.ts', `import { PrismaClient, VehicleType } from '@prisma/client';
import { KINSHASA_COMMUNES } from '@mova/shared';
const prisma = new PrismaClient();
const PRICING_RULES = [
  { vehicleType: VehicleType.MOTO_TAXI, baseFareCdf: 1500, perKmCdf: 800, perMinuteCdf: 100, minFareCdf: 2000, peakMultiplier: 1.3, nightMultiplier: 1.2 },
  { vehicleType: VehicleType.STANDARD, baseFareCdf: 3000, perKmCdf: 1500, perMinuteCdf: 200, minFareCdf: 5000, peakMultiplier: 1.3, nightMultiplier: 1.2 },
  { vehicleType: VehicleType.COMFORT, baseFareCdf: 5000, perKmCdf: 2500, perMinuteCdf: 300, minFareCdf: 8000, peakMultiplier: 1.4, nightMultiplier: 1.3 },
];
const CANCELLATION_POLICIES = [
  { vehicleType: VehicleType.MOTO_TAXI, freeCancelMinutes: 2, passengerFeeCdf: 1000, driverCompensationCdf: 500, noShowFeeCdf: 2000 },
  { vehicleType: VehicleType.STANDARD, freeCancelMinutes: 3, passengerFeeCdf: 2000, driverCompensationCdf: 1000, noShowFeeCdf: 5000 },
  { vehicleType: VehicleType.COMFORT, freeCancelMinutes: 5, passengerFeeCdf: 3000, driverCompensationCdf: 1500, noShowFeeCdf: 8000 },
];
async function main() {
  for (const c of KINSHASA_COMMUNES) {
    await prisma.commune.upsert({ where: { name: c.name }, create: { name: c.name, lat: c.lat, lng: c.lng }, update: { lat: c.lat, lng: c.lng } });
  }
  for (const r of PRICING_RULES) {
    await prisma.pricingRule.upsert({ where: { vehicleType: r.vehicleType }, create: r, update: r });
  }
  for (const p of CANCELLATION_POLICIES) {
    await prisma.cancellationPolicy.upsert({ where: { vehicleType: p.vehicleType }, create: p, update: p });
  }
  console.log('Ride service seed complete');
}
main().finally(() => prisma.\$disconnect());
`);

['common/internal-api.guard.ts', 'auth/jwt-auth.guard.ts', 'auth/jwt.strategy.ts'].forEach((f) => {
  const content = f.includes('internal') ? internalGuard : f.includes('guard') ? jwtAuthGuard : jwtStrategy;
  w(`services/ride-service/src/${f}`, content);
});

// Ride service source files written via compact module generator below
const rideFiles = require('./ride-service-files');
rideFiles.writeAll(w);

// ============ NOTIFICATION SERVICE ============
setupBase('notification-service', 3005, true, { '@prisma/client': '^5.22.0', prisma: '^5.22.0' });
w('services/notification-service/src/main.ts', mainTs(3005, 'notification-service'));
w('services/notification-service/prisma/schema.prisma', `generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql" url = env("DATABASE_URL") }
model Notification {
  id String @id @default(uuid())
  userId String
  title String
  body String
  type String
  read Boolean @default(false)
  data Json?
  createdAt DateTime @default(now())
  @@index([userId])
  @@map("notifications")
}
`);
w('services/notification-service/prisma/migrations/20240612000000_init/migration.sql', `CREATE TABLE "notifications" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "title" TEXT NOT NULL, "body" TEXT NOT NULL, "type" TEXT NOT NULL, "read" BOOLEAN NOT NULL DEFAULT false, "data" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"));
CREATE INDEX "notifications_userId_idx" ON "notifications"("userId");
`);
const notifFiles = require('./notification-service-files');
notifFiles.writeAll(w);

// ============ ADMIN SERVICE ============
setupBase('admin-service', 3006, false);
w('services/admin-service/src/main.ts', mainTs(3006, 'admin-service'));
const adminFiles = require('./admin-service-files');
adminFiles.writeAll(w);

// ============ API GATEWAY ============
setupBase('api-gateway', 3000, false, {
  'http-proxy-middleware': '^3.0.3',
  '@nestjs/throttler': '^6.2.1',
  '@nestjs/jwt': '^10.2.0',
  '@nestjs/passport': '^10.0.3',
  passport: '^0.7.0',
  'passport-jwt': '^4.0.1',
});
w('services/api-gateway/src/main.ts', `import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from '@mova/shared';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',') ?? '*', credentials: true });
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log('SENGA api-gateway on port ' + port);
}
bootstrap();
`);
const gatewayFiles = require('./gateway-service-files');
gatewayFiles.writeAll(w);

// Dockerfiles
['api-gateway', 'auth-service', 'ride-service', 'payment-service', 'driver-service', 'notification-service', 'admin-service'].forEach((svc) => {
  const dockerName = svc === 'api-gateway' ? 'gateway' : svc.replace('-service', '');
  w(`docker/${dockerName}.Dockerfile`, serviceDockerfile(svc));
});

console.log('Generated', created.length, 'files');
console.log(created.join('\\n'));
