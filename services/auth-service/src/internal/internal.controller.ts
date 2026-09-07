import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole, UserStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { UsersService } from '../users/users.service';
import { AuthService } from '../auth/auth.service';
import { InternalApiGuard } from '../common/internal-api.guard';

class CreateUserAdminDto {
  @IsString() phone: string;
  @IsEnum(UserRole) role: UserRole;
  @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
}

class UpdateUserAdminDto {
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() phone?: string;
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
  constructor(private users: UsersService, private auth: AuthService) {}
  @Get('users/count')
  async count() {
    const { total } = await this.users.listUsers(0, 1);
    return { count: total };
  }
  @Get('users')
  list(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('search') search?: string,
    @Query('includePlayPrelaunch') includePlayPrelaunch?: string,
  ) {
    return this.users.listUsers(
      Number(skip ?? 0),
      Number(take ?? 50),
      search,
      includePlayPrelaunch === 'true' || includePlayPrelaunch === '1',
    );
  }

  @Get('users/play-prelaunch')
  listPlayPrelaunch() {
    return this.users.listPlayPrelaunchUsers();
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

  /** SMS hub + mailer from User.phone / User.email. */
  @Post('users/:id/notify')
  notifyUser(@Param('id') id: string, @Body() dto: NotifyUserDto) {
    return this.auth.notifyUser(id, dto);
  }
}
