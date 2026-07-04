import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SubscriptionTarget } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SubscriptionsService } from './subscriptions.service';

class SubscribeDto {
  @ApiProperty() @IsString() planId: string;
}

@ApiTags('subscriptions')
@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SubscriptionsController {
  constructor(private subscriptions: SubscriptionsService) {}

  @Get('plans')
  @ApiOperation({ summary: 'Plans d\'abonnement MOVA Plus actifs' })
  listPlans() {
    return this.subscriptions.listPlans(true);
  }

  @Get('mine')
  @ApiOperation({ summary: 'Mon abonnement actif' })
  mine(@Request() req: { user: { id: string } }) {
    return this.subscriptions.getActiveSubscription(req.user.id);
  }

  @Post('subscribe')
  @ApiOperation({ summary: 'Souscrire un plan (débit portefeuille)' })
  subscribe(@Request() req: { user: { id: string } }, @Body() dto: SubscribeDto) {
    return this.subscriptions.subscribe(req.user.id, dto.planId);
  }
}
