import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InternalApiGuard } from '../common/internal-api.guard';
import { StaffAlertsService } from './staff-alerts.service';

@ApiTags('internal-staff-alerts')
@Controller('internal/staff-alerts')
@UseGuards(InternalApiGuard)
export class StaffAlertsInternalController {
  constructor(private alerts: StaffAlertsService) {}

  @Get()
  list(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('city') city?: string,
    @Query('severity') severity?: string,
  ) {
    return this.alerts.list({
      skip: Number(skip ?? 0),
      take: Number(take ?? 50),
      unreadOnly: unreadOnly === 'true' || unreadOnly === '1',
      city,
      severity,
    });
  }

  @Post()
  create(
    @Body()
    body: {
      severity?: string;
      title?: string;
      body?: string;
      city?: string;
      href?: string;
      targetRole?: string;
    },
  ) {
    return this.alerts.create({
      severity: body.severity,
      title: body.title ?? 'Alerte',
      body: body.body ?? '',
      city: body.city,
      href: body.href,
      targetRole: body.targetRole,
    });
  }

  @Patch('read-all')
  markAllRead() {
    return this.alerts.markAllRead();
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string) {
    return this.alerts.markRead(id);
  }
}
