import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole, UserStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { UsersService } from '../users/users.service';
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

@ApiTags('internal')
@Controller('internal')
@UseGuards(InternalApiGuard)
export class InternalController {
  constructor(private users: UsersService) {}
  @Get('users/count')
  async count() {
    const { total } = await this.users.listUsers(0, 1);
    return { count: total };
  }
  @Get('users')
  list(@Query('skip') skip?: string, @Query('take') take?: string, @Query('search') search?: string) {
    return this.users.listUsers(Number(skip ?? 0), Number(take ?? 50), search);
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
}
