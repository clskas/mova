import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
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
