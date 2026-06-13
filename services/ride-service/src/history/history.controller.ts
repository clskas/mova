import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HistoryService, HistoryType } from './history.service';

@ApiTags('history')
@Controller('history')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class HistoryController {
  constructor(private historyService: HistoryService) {}

  @Get()
  @ApiOperation({ summary: 'Historique unifié (courses, livraisons, réservations, etc.)' })
  list(
    @Request() req: { user: { id: string } },
    @Query('type') type?: HistoryType,
    @Query('limit') limit?: string,
  ) {
    return this.historyService.getUnifiedHistory(req.user.id, type, limit ? parseInt(limit, 10) : 30);
  }
}
