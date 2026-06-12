import { Controller, Get, Param, Patch, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';
@ApiTags('notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}
  @Get() @ApiOperation({ summary: 'Mes notifications' }) list(@Request() req: { user: { id: string } }) { return this.notifications.list(req.user.id); }
  @Patch(':id/read') @ApiOperation({ summary: 'Marquer comme lu' }) read(@Param('id') id: string) { return this.notifications.markRead(id); }
}
