import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole, UserStatus } from '@prisma/client';
import { IsArray, IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { UsersService } from '../users/users.service';
import { AuthService } from '../auth/auth.service';
import { ModerationService } from '../moderation/moderation.service';
import { InternalApiGuard } from '../common/internal-api.guard';

class CreateUserAdminDto {
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsEnum(UserRole) role: UserRole;
  @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() managedCity?: string;
}

class UpdateUserAdminDto {
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  /** Empty string is accepted then coerced to null (Google-only users). */
  @IsOptional() @IsString() phone?: string | null;
  @IsOptional() managedCity?: string | null;
  @IsOptional() @IsString() homeCity?: string | null;
  @IsOptional() @IsString() avatarUrl?: string | null;
  @IsOptional() @IsArray() @IsString({ each: true }) adminPermissions?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) accessLevelIds?: string[];
}

class PurgeUserDto {
  @IsOptional() @IsString() actorId?: string;
}

class NotifyUserDto {
  @IsString() smsText: string;
  @IsString() emailSubject: string;
  @IsString() emailText: string;
  @IsOptional() @IsString() emailHtml?: string;
  @IsOptional() @IsString() purpose?: string;
}

class IssueLoginPinDto {
  @IsOptional() @IsString() pin?: string;
  @IsOptional() @IsBoolean() notify?: boolean;
  @IsOptional() @IsString() purpose?: string;
}

@ApiTags('internal')
@Controller('internal')
@UseGuards(InternalApiGuard)
export class InternalController {
  constructor(
    private users: UsersService,
    private auth: AuthService,
    private moderation: ModerationService,
  ) {}
  @Get('users/count')
  async count(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('role') role?: string,
    @Query('ids') ids?: string,
    @Query('includePlayPrelaunch') includePlayPrelaunch?: string,
  ) {
    const idList = (ids ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    const count = await this.users.countUsers({
      from,
      to,
      role,
      ids: idList.length > 0 ? idList : undefined,
      includePlayPrelaunch: includePlayPrelaunch === 'true' || includePlayPrelaunch === '1',
    });
    return { count };
  }

  @Get('users/ops-staff')
  listOpsStaff() {
    return this.users.listOpsStaffForAlerts();
  }

  /** Active users for SOS audiences: roles=PASSENGER,DRIVER,RESTAURANT,RENTAL_PARTNER */
  @Get('users/by-roles')
  listByRoles(@Query('roles') roles?: string, @Query('take') take?: string) {
    const allowed = new Set<UserRole>([
      UserRole.PASSENGER,
      UserRole.DRIVER,
      UserRole.RESTAURANT,
      UserRole.RENTAL_PARTNER,
    ]);
    const filtered = (roles ?? '')
      .split(',')
      .map((r) => r.trim().toUpperCase())
      .filter((r): r is UserRole => allowed.has(r as UserRole));
    return this.users.listUsersByRolesForAlerts(filtered, Number(take ?? 500));
  }

  @Get('users')
  list(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('search') search?: string,
    @Query('includePlayPrelaunch') includePlayPrelaunch?: string,
    @Query('role') role?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.users.listUsers(
      Number(skip ?? 0),
      Number(take ?? 50),
      search,
      includePlayPrelaunch === 'true' || includePlayPrelaunch === '1',
      { role, from, to },
    );
  }

  @Get('users/play-prelaunch')
  listPlayPrelaunch() {
    return this.users.listPlayPrelaunchUsers();
  }

  @Get('users/by-home-city')
  listByHomeCity(@Query('cities') cities?: string, @Query('role') role?: string) {
    const list = (cities ?? '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    const roleFilter =
      role?.trim().toUpperCase() === 'PASSENGER' || !role?.trim()
        ? UserRole.PASSENGER
        : (role.trim().toUpperCase() as UserRole);
    return this.users.listUsersByHomeCities(list, roleFilter);
  }

  @Post('users/:id/home-city')
  touchHomeCity(@Param('id') id: string, @Body() body: { city?: string }) {
    return this.users.touchHomeCity(id, body?.city ?? '');
  }

  @Post('users/purge-play-prelaunch')
  purgePlayPrelaunch(@Body() body: PurgeUserDto) {
    return this.users.purgePlayPrelaunchUsers(body?.actorId);
  }
  @Get('users/:id')
  get(@Param('id') id: string) { return this.users.findById(id); }
  @Post('users')
  create(@Body() dto: CreateUserAdminDto) { return this.users.createAdmin(dto); }
  @Patch('users/:id')
  update(@Param('id') id: string, @Body() dto: UpdateUserAdminDto) { return this.users.updateAdmin(id, dto); }
  @Delete('users/:id')
  deactivate(@Param('id') id: string) { return this.users.deactivateUser(id); }
  @Post('users/:id/purge')
  purge(@Param('id') id: string, @Body() body: PurgeUserDto) {
    return this.users.purgeUser(id, body?.actorId);
  }
  @Post('users/:id/issue-login-pin')
  issueLoginPin(@Param('id') id: string, @Body() dto: IssueLoginPinDto) {
    return this.auth.issueLoginPin(id, { pin: dto?.pin, notify: dto?.notify });
  }

  @Post('users/:id/verify-login-pin')
  verifyLoginPin(@Param('id') id: string, @Body() dto: { pin?: string }) {
    return this.auth.verifyLoginPin(id, dto?.pin ?? '');
  }

  /** SMS hub + mailer from User.phone / User.email. */
  @Post('users/:id/notify')
  notifyUser(@Param('id') id: string, @Body() dto: NotifyUserDto) {
    return this.auth.notifyUser(id, dto);
  }

  @Post('audit')
  writeAudit(
    @Body()
    body: {
      actorUserId?: string;
      action?: string;
      resourceType?: string;
      resourceId?: string;
      meta?: Record<string, unknown>;
      ip?: string;
    },
  ) {
    return this.moderation.writeAudit({
      actorUserId: body.actorUserId ?? 'system',
      action: body.action ?? 'UNKNOWN',
      resourceType: body.resourceType ?? 'unknown',
      resourceId: body.resourceId,
      meta: body.meta,
      ip: body.ip,
    });
  }

  @Get('audit')
  listAudit(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('action') action?: string,
    @Query('resourceType') resourceType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.moderation.listAudit({
      skip: Number(skip ?? 0),
      take: Number(take ?? 50),
      actorUserId,
      action,
      resourceType,
      from,
      to,
    });
  }

  @Get('blacklist')
  listBlacklist(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('type') type?: string,
    @Query('q') q?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.moderation.listBlacklist({
      skip: Number(skip ?? 0),
      take: Number(take ?? 50),
      type,
      q,
      activeOnly: activeOnly !== 'false' && activeOnly !== '0',
    });
  }

  @Post('blacklist')
  upsertBlacklist(
    @Body()
    body: {
      type?: string;
      value?: string;
      reason?: string;
      expiresAt?: string | null;
      createdBy?: string;
      active?: boolean;
    },
  ) {
    return this.moderation.upsertBlacklist({
      type: body.type ?? 'PHONE',
      value: body.value ?? '',
      reason: body.reason ?? '',
      expiresAt: body.expiresAt,
      createdBy: body.createdBy,
      active: body.active,
    });
  }

  @Post('blacklist/:id/deactivate')
  deactivateBlacklist(@Param('id') id: string) {
    return this.moderation.deactivateBlacklist(id);
  }

  @Get('blacklist/check')
  checkBlacklist(
    @Query('phone') phone?: string,
    @Query('email') email?: string,
    @Query('userId') userId?: string,
  ) {
    return this.moderation.isBlocked({ phone, email, userId });
  }
}
