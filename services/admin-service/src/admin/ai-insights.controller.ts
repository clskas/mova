import { Body, Controller, Get, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminPermission } from '@mova/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { resolveManagedCityScope, type AdminJwtUser } from '../common/city-scope.util';
import { AiInsightsService } from './ai-insights.service';

@ApiTags('admin')
@Controller('admin/ai')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AiInsightsController {
  constructor(private ai: AiInsightsService) {}

  @Post('ask')
  @RequirePermissions(AdminPermission.METRICS_READ)
  @ApiOperation({ summary: 'Question sur les données en langage courant (IA, lecture seule)' })
  ask(@Request() req: { user: AdminJwtUser }, @Body() body: { question?: string; days?: number; city?: string }) {
    const city = resolveManagedCityScope(req.user) ?? (body?.city?.trim() || null);
    return this.ai.ask(String(body?.question ?? ''), Number(body?.days ?? 30), city);
  }

  @Get('daily-summary')
  @RequirePermissions(AdminPermission.METRICS_READ)
  @ApiOperation({ summary: 'Résumé de la journée pour l’équipe (IA)' })
  dailySummary(@Request() req: { user: AdminJwtUser }, @Query('city') city?: string, @Query('refresh') refresh?: string) {
    const scoped = resolveManagedCityScope(req.user) ?? (city?.trim() || null);
    return this.ai.dailySummary(scoped, refresh === '1' || refresh === 'true');
  }

  @Post('reply-draft')
  @RequirePermissions(AdminPermission.INCIDENTS_READ)
  @ApiOperation({ summary: 'Brouillon de réponse à un litige ou un avis (IA), à relire avant envoi' })
  replyDraft(@Body() body: { kind?: string; subject?: string; message?: string }) {
    return this.ai.replyDraft(body);
  }
}
