import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GrowthService } from './growth.service';

@ApiTags('payments')
@Controller('payments')
@UseGuards(JwtAuthGuard)
export class GrowthController {
  constructor(private growth: GrowthService) {}

  @Get('tips/config')
  @ApiOperation({ summary: 'Pourboire : activé ? montants proposés' })
  tipConfig() {
    return this.growth.tipConfig();
  }

  @Post('tips/rides/:rideId')
  @ApiOperation({ summary: 'Donner un pourboire au chauffeur (portefeuille, 100 % au chauffeur)' })
  tip(@Request() req: { user: { id: string } }, @Param('rideId') rideId: string, @Body() body: { amountCdf: number }) {
    return this.growth.tip(req.user.id, rideId, Number(body?.amountCdf));
  }

  @Get('loyalty')
  @ApiOperation({ summary: 'Mes points de fidélité' })
  loyalty(@Request() req: { user: { id: string } }) {
    return this.growth.loyalty(req.user.id);
  }

  @Post('loyalty/redeem')
  @ApiOperation({ summary: 'Échanger des points contre un crédit portefeuille' })
  redeem(@Request() req: { user: { id: string } }) {
    return this.growth.redeem(req.user.id);
  }
}
