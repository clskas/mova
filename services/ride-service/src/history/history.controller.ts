import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HistoryService, HistoryType } from './history.service';
import { DriverHistoryService } from './driver-history.service';

@ApiTags('history')
@Controller('history')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class HistoryController {
  constructor(
    private historyService: HistoryService,
    private driverHistory: DriverHistoryService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Historique unifié (courses, livraisons, réservations, etc.)' })
  list(
    @Request() req: { user: { id: string } },
    @Query('type') type?: HistoryType,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    return this.historyService.getUnifiedHistory(
      req.user.id,
      type,
      limit ? parseInt(limit, 10) : 30,
      before ? new Date(before) : undefined,
    );
  }

  @Get('driver')
  @ApiOperation({ summary: 'Missions du chauffeur hors courses taxi (livraisons, courses, déménagements, location…)' })
  driver(@Request() req: { user: { id: string } }, @Query('limit') limit?: string, @Query('before') before?: string) {
    return this.driverHistory.list(req.user.id, limit ? parseInt(limit, 10) : 50, before ? new Date(before) : undefined);
  }
}
