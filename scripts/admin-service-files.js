/* eslint-disable */
module.exports.writeAll = function writeAll(w) {
  w('services/admin-service/src/common/internal-api.guard.ts', `import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { INTERNAL_API_KEY } from '@mova/shared';
@Injectable()
export class InternalApiGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    return ctx.switchToHttp().getRequest().headers['x-internal-api-key'] === INTERNAL_API_KEY;
  }
}
`);

  w('services/admin-service/src/auth/jwt-auth.guard.ts', `import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
`);

  w('services/admin-service/src/auth/jwt.strategy.ts', `import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), ignoreExpiration: false, secretOrKey: config.get('JWT_SECRET') ?? 'dev_secret' });
  }
  validate(payload: { sub: string; role: string }) {
    if (payload.role !== 'ADMIN') throw new UnauthorizedException('Admin only');
    return { id: payload.sub, role: payload.role };
  }
}
`);

  w('services/admin-service/src/auth/auth.module.ts', `import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' }), JwtModule.registerAsync({ imports: [ConfigModule], useFactory: (c: ConfigService) => ({ secret: c.get('JWT_SECRET') ?? 'dev_secret' }), inject: [ConfigService] })],
  providers: [JwtStrategy],
})
export class AuthModule {}
`);

  w('services/admin-service/src/admin/admin.service.ts', `import { Injectable } from '@nestjs/common';
import { INTERNAL_API_KEY, serviceUrl } from '@mova/shared';

@Injectable()
export class AdminService {
  private headers = { 'x-internal-api-key': INTERNAL_API_KEY };

  private async fetchJson<T>(service: 'auth' | 'ride' | 'driver', path: string): Promise<T> {
    const res = await fetch(serviceUrl(service, path), { headers: this.headers });
    if (!res.ok) throw new Error(\`Admin proxy failed: \${service}\${path}\`);
    return res.json();
  }

  async getMetrics() {
    const [users, drivers, rideStats, incidents] = await Promise.all([
      this.fetchJson<{ count: number }>('auth', '/internal/users/count').catch(() => ({ count: 0 })),
      this.fetchJson<{ count: number }>('driver', '/internal/drivers/count').catch(() => ({ count: 0 })),
      this.fetchJson<{ rides: number; completed: number; revenueCdf: number }>('ride', '/internal/rides/stats').catch(() => ({ rides: 0, completed: 0, revenueCdf: 0 })),
      this.fetchJson<unknown[]>('driver', '/internal/incidents').catch(() => []),
    ]);
    const openIncidents = Array.isArray(incidents) ? incidents.filter((i: { status?: string }) => i.status === 'OPEN').length : 0;
    return { users: users.count, drivers: drivers.count, rides: rideStats.rides, completedRides: rideStats.completed, revenueCdf: rideStats.revenueCdf, openIncidents, city: 'Kinshasa' };
  }

  listUsers(skip = 0, take = 50) { return this.fetchJson('auth', \`/internal/users?skip=\${skip}&take=\${take}\`); }
  pendingKyc() { return this.fetchJson('driver', '/internal/kyc/pending'); }
  approveKyc(id: string, approved: boolean, notes?: string) {
    return fetch(serviceUrl('driver', \`/internal/kyc/\${id}/review\`), { method: 'POST', headers: { ...this.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ approved, notes }) }).then((r) => r.json());
  }
  listIncidents() { return this.fetchJson('driver', '/internal/incidents'); }
  resolveIncident(id: string, status: string) {
    return fetch(serviceUrl('driver', \`/internal/incidents/\${id}/resolve\`), { method: 'POST', headers: { ...this.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }).then((r) => r.json());
  }
}
`);

  w('services/admin-service/src/admin/admin.controller.ts', `import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminService } from './admin.service';

class ApproveKycDto {
  @ApiProperty() @IsBoolean() approved: boolean;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}

@ApiTags('admin')
@Controller('admin')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminController {
  constructor(private adminService: AdminService) {}
  @Get('metrics') @ApiOperation({ summary: 'Tableau de bord métriques' }) metrics() { return this.adminService.getMetrics(); }
  @Get('users') @ApiOperation({ summary: 'Liste utilisateurs' }) users(@Query('skip') skip?: string, @Query('take') take?: string) { return this.adminService.listUsers(Number(skip ?? 0), Number(take ?? 50)); }
  @Get('kyc/pending') @ApiOperation({ summary: 'KYC en attente' }) pendingKyc() { return this.adminService.pendingKyc(); }
  @Post('kyc/:id/review') @ApiOperation({ summary: 'Valider/rejeter KYC' }) reviewKyc(@Param('id') id: string, @Body() dto: ApproveKycDto) { return this.adminService.approveKyc(id, dto.approved, dto.notes); }
  @Get('incidents') @ApiOperation({ summary: 'Liste incidents' }) incidents() { return this.adminService.listIncidents(); }
  @Post('incidents/:id/resolve') @ApiOperation({ summary: 'Résoudre incident' }) resolve(@Param('id') id: string, @Body('status') status: string) { return this.adminService.resolveIncident(id, status ?? 'RESOLVED'); }
}
`);

  w('services/admin-service/src/admin/admin.module.ts', `import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
@Module({ controllers: [AdminController], providers: [AdminService] })
export class AdminModule {}
`);

  w('services/admin-service/src/app.module.ts', `import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), HealthModule, AuthModule, AdminModule] })
export class AppModule {}
`);
};
