import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateFoodDeliveryDto, CreateParcelDeliveryDto, UpdateDeliveryStatusDto } from './deliveries.dto';
import { DeliveriesService } from './deliveries.service';

@ApiTags('deliveries')
@Controller('deliveries')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DeliveriesController {
  constructor(private deliveriesService: DeliveriesService) {}

  @Post('parcel/estimate')
  @ApiOperation({ summary: 'Estimer livraison colis (CDF)' })
  estimateParcel(@Body() dto: CreateParcelDeliveryDto) {
    return this.deliveriesService.estimateParcel(dto);
  }

  @Post('parcel')
  @ApiOperation({ summary: 'Créer livraison colis' })
  createParcel(@Request() req: { user: { id: string } }, @Body() dto: CreateParcelDeliveryDto) {
    return this.deliveriesService.createParcel(req.user.id, dto);
  }

  @Post('food/estimate')
  @ApiOperation({ summary: 'Estimer commande repas (CDF)' })
  estimateFood(@Body() dto: CreateFoodDeliveryDto) {
    return this.deliveriesService.estimateFood(dto);
  }

  @Post('food')
  @ApiOperation({ summary: 'Commander livraison repas' })
  createFood(@Request() req: { user: { id: string } }, @Body() dto: CreateFoodDeliveryDto) {
    return this.deliveriesService.createFood(req.user.id, dto);
  }

  @Get('restaurants')
  @ApiOperation({ summary: 'Liste restaurants Kinshasa' })
  restaurants() {
    return this.deliveriesService.listRestaurants();
  }

  @Get('history')
  @ApiOperation({ summary: 'Historique livraisons' })
  history(@Request() req: { user: { id: string } }) {
    return this.deliveriesService.getHistory(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail livraison' })
  get(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.deliveriesService.getDelivery(id, req.user.id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Mettre à jour statut livraison' })
  status(@Request() req: { user: { id: string } }, @Param('id') id: string, @Body() dto: UpdateDeliveryStatusDto) {
    return this.deliveriesService.updateStatus(id, dto.status, req.user.id);
  }
}
