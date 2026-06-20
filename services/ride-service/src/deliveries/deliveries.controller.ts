import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ErrandsService } from '../errands/errands.service';
import { CreateFoodDeliveryDto, CreateFoodMultiDeliveryDto, CreateParcelDeliveryDto, RateDeliveryDto, UpdateDeliveryStatusDto, ValidatePromoDto } from './deliveries.dto';
import { MobileErrandCreateDto, MobileErrandEstimateDto } from './deliveries-mobile.dto';
import { DeliveriesService } from './deliveries.service';

@ApiTags('deliveries')
@Controller('deliveries')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DeliveriesController {
  constructor(private deliveriesService: DeliveriesService, private errandsService: ErrandsService) {}

  @Post('upload-photo')
  @ApiOperation({ summary: 'Alias téléversement photo colis' })
  uploadPhotoAlias() {
    return { message: 'Utilisez POST /api/uploads/parcel-photo avec imageBase64.' };
  }

  @Post('errand/estimate')
  @ApiOperation({ summary: 'Estimer course/commission (contrat mobile)' })
  estimateErrand(@Body() dto: MobileErrandEstimateDto) {
    return this.errandsService.estimateMobile(dto.deliveryAddress, dto.items ?? [], dto.pickupAddress, dto.budgetCdf);
  }

  @Post('errand')
  @ApiOperation({ summary: 'Créer commande courses/commissions (contrat mobile)' })
  createErrand(@Request() req: { user: { id: string } }, @Body() dto: MobileErrandCreateDto) {
    return this.errandsService.createMobile(
      req.user.id,
      dto.deliveryAddress,
      dto.items ?? [],
      dto.deliveryLat,
      dto.deliveryLng,
      dto.pickupAddress,
      dto.budgetCdf,
    );
  }

  @Get('errand/history')
  @ApiOperation({ summary: 'Historique courses/commissions (contrat mobile)' })
  async errandHistory(@Request() req: { user: { id: string } }) {
    return { data: await this.errandsService.listMobile(req.user.id) };
  }

  @Get('restaurants')
  @ApiOperation({ summary: 'Liste restaurants Kinshasa' })
  restaurants(
    @Query('deliveryLat') deliveryLat?: string,
    @Query('deliveryLng') deliveryLng?: string,
    @Query('cuisine') cuisine?: string,
    @Query('maxEtaMin') maxEtaMin?: string,
    @Query('maxPriceCdf') maxPriceCdf?: string,
    @Query('maxDistanceKm') maxDistanceKm?: string,
  ) {
    const lat = deliveryLat != null ? Number(deliveryLat) : undefined;
    const lng = deliveryLng != null ? Number(deliveryLng) : undefined;
    const eta = maxEtaMin != null ? Number(maxEtaMin) : undefined;
    const price = maxPriceCdf != null ? Number(maxPriceCdf) : undefined;
    const distance = maxDistanceKm != null ? Number(maxDistanceKm) : undefined;
    return this.deliveriesService.listRestaurants(
      lat != null && !Number.isNaN(lat) ? lat : undefined,
      lng != null && !Number.isNaN(lng) ? lng : undefined,
      cuisine,
      eta != null && !Number.isNaN(eta) ? eta : undefined,
      price != null && !Number.isNaN(price) ? price : undefined,
      distance != null && !Number.isNaN(distance) ? distance : undefined,
    );
  }

  @Get('restaurants/:id')
  @ApiOperation({ summary: 'Détail restaurant et menu' })
  restaurant(@Param('id') id: string) {
    return this.deliveriesService.getRestaurant(id);
  }

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

  @Post('food/multi/estimate')
  @ApiOperation({ summary: 'Estimer commande repas multi-restaurants (CDF)' })
  estimateFoodMulti(@Body() dto: CreateFoodMultiDeliveryDto) {
    return this.deliveriesService.estimateFoodMulti(dto);
  }

  @Post('promo/validate')
  @ApiOperation({ summary: 'Valider un code promo livraison repas' })
  validatePromo(@Body() dto: ValidatePromoDto) {
    return this.deliveriesService.validatePromoCode(dto.code);
  }

  @Post('food')
  @ApiOperation({ summary: 'Commander livraison repas' })
  createFood(@Request() req: { user: { id: string } }, @Body() dto: CreateFoodDeliveryDto) {
    return this.deliveriesService.createFood(req.user.id, dto);
  }

  @Post('food/multi')
  @ApiOperation({ summary: 'Commander livraison repas multi-restaurants' })
  createFoodMulti(@Request() req: { user: { id: string } }, @Body() dto: CreateFoodMultiDeliveryDto) {
    return this.deliveriesService.createFoodMulti(req.user.id, dto);
  }

  @Get('offers')
  @ApiOperation({ summary: 'Offres livraison et courses/commissions pour chauffeur' })
  async offers(@Request() req: { user: { id: string } }) {
    const [deliveries, errands] = await Promise.all([
      this.deliveriesService.getDriverOffers(req.user.id),
      this.errandsService.getDriverOffers(req.user.id),
    ]);
    const offers = [...deliveries.offers, ...errands.offers].sort((a, b) => {
      const left = a as Record<string, unknown>;
      const right = b as Record<string, unknown>;
      if (left.alreadyAssigned && !right.alreadyAssigned) return -1;
      if (!left.alreadyAssigned && right.alreadyAssigned) return 1;
      return ((left.distanceToPickupKm as number) ?? 999) - ((right.distanceToPickupKm as number) ?? 999);
    });
    return { offers, documentsBlocked: deliveries.documentsBlocked };
  }

  @Get('assignments')
  @ApiOperation({ summary: 'Courses/commissions assignées au chauffeur par l\'admin' })
  assignments(@Request() req: { user: { id: string } }) {
    return this.errandsService.listForDriver(req.user.id);
  }

  @Post(':id/accept')
  @ApiOperation({ summary: 'Accepter une livraison ou course/commission (chauffeur)' })
  async accept(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    try {
      return await this.deliveriesService.acceptDelivery(id, req.user.id);
    } catch (error) {
      if (error instanceof MovaHttpException && error.code === MovaErrorCode.DELIVERY_NOT_FOUND) {
        return this.errandsService.acceptErrand(id, req.user.id);
      }
      throw error;
    }
  }

  @Get('history')
  @ApiOperation({ summary: 'Historique livraisons (passager ou chauffeur via ?role=driver)' })
  async history(@Request() req: { user: { id: string } }, @Query('role') role?: string) {
    const deliveries = await this.deliveriesService.getHistory(req.user.id, role);
    if (role !== 'driver') return deliveries;
    const errands = await this.errandsService.listDriverHistory(req.user.id);
    return {
      data: [...deliveries.data, ...errands].sort(
        (a, b) =>
          new Date((b.createdAt as string) ?? 0).getTime() - new Date((a.createdAt as string) ?? 0).getTime(),
      ),
    };
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Annuler livraison' })
  cancel(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.deliveriesService.cancelDelivery(id, req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail livraison ou course/commission' })
  async get(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    try {
      return this.deliveriesService.getDelivery(id, req.user.id);
    } catch (error) {
      if (error instanceof MovaHttpException && error.code === MovaErrorCode.DELIVERY_NOT_FOUND) {
        return this.errandsService.get(id, req.user.id);
      }
      throw error;
    }
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Mettre à jour statut livraison' })
  status(@Request() req: { user: { id: string } }, @Param('id') id: string, @Body() dto: UpdateDeliveryStatusDto) {
    return this.deliveriesService.updateStatus(id, dto.status, req.user.id);
  }

  @Post(':id/rate')
  @ApiOperation({ summary: 'Noter restaurant et livreur après livraison repas' })
  rate(@Request() req: { user: { id: string } }, @Param('id') id: string, @Body() dto: RateDeliveryDto) {
    return this.deliveriesService.rateDelivery(id, req.user.id, dto);
  }
}
