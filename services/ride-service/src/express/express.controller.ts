import { Controller, Post, Body, Request, UseGuards } from '@nestjs/common';
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
}
