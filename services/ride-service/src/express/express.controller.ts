import { Controller, Get, Param, Post, Body, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateParcelDeliveryDto } from '../deliveries/deliveries.dto';
import { DeliveriesService } from '../deliveries/deliveries.service';

@ApiTags('express')
@Controller('express')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ExpressController {
  constructor(private deliveriesService: DeliveriesService) {}

  @Post('estimate')
  @ApiOperation({ summary: 'Estimer livraison express (CDF, prioritaire)' })
  estimate(@Body() dto: CreateParcelDeliveryDto) {
    return this.deliveriesService.estimateExpress(dto);
  }

  @Post()
  @ApiOperation({ summary: 'Créer livraison express' })
  create(@Request() req: { user: { id: string } }, @Body() dto: CreateParcelDeliveryDto) {
    return this.deliveriesService.createExpress(req.user.id, dto);
  }

  @Get('history')
  @ApiOperation({ summary: 'Historique livraisons express' })
  history(@Request() req: { user: { id: string } }) {
    return this.deliveriesService.getExpressHistory(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail livraison express avec suivi' })
  get(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.deliveriesService.getDelivery(id, req.user.id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Annuler livraison express' })
  cancel(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.deliveriesService.cancelDelivery(id, req.user.id);
  }
}
