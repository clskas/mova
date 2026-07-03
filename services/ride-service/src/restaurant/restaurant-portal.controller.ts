import { Body, Controller, Get, Param, Patch, Post, Query, Request, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PartnerPromoDto } from '../promo/partner-promo.dto';
import { PartnerPromoService } from '../promo/partner-promo.service';
import { PartnerBillingService } from '../billing/partner-billing.service';
import { RejectOrderDto, UpdateRestaurantLocationDto, UpdateRestaurantMenuDto, UploadMenuPhotoDto } from './restaurant-portal.dto';
import { RestaurantPortalService } from './restaurant-portal.service';
import { RestaurantRoleGuard } from './restaurant-role.guard';

@ApiTags('restaurant')
@Controller('restaurant')
@UseGuards(JwtAuthGuard, RestaurantRoleGuard)
@ApiBearerAuth()
export class RestaurantPortalController {
  constructor(
    private portal: RestaurantPortalService,
    private partnerPromo: PartnerPromoService,
    private partnerBilling: PartnerBillingService,
  ) {}

  @Get('menu')
  @ApiOperation({ summary: 'Menu complet du restaurant' })
  menuList(@Request() req: { user: { id: string } }) {
    return this.portal.getMenu(req.user.id);
  }

  @Get('profile')
  @ApiOperation({ summary: 'Profil restaurant du compte connecté' })
  profile(@Request() req: { user: { id: string } }) {
    return this.portal.getProfile(req.user.id);
  }

  @Get('orders')
  @ApiOperation({ summary: 'Commandes repas du restaurant' })
  orders(@Request() req: { user: { id: string } }, @Query('status') status?: string) {
    return this.portal.listOrders(req.user.id, status);
  }

  @Get('earnings')
  @ApiOperation({ summary: 'Solde et ventes repas créditées' })
  earnings(@Request() req: { user: { id: string } }) {
    return this.portal.getEarnings(req.user.id);
  }

  @Post('orders/:id/confirm')
  @ApiOperation({ summary: 'Accepter une commande (PENDING → RESTAURANT_CONFIRMED)' })
  confirm(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.portal.confirmOrder(id, req.user.id);
  }

  @Post('orders/:id/ready')
  @ApiOperation({ summary: 'Marquer prête pour livreur' })
  ready(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.portal.markReady(id, req.user.id);
  }

  @Post('orders/:id/reject')
  @ApiOperation({ summary: 'Refuser / annuler une commande' })
  reject(@Request() req: { user: { id: string } }, @Param('id') id: string, @Body() dto: RejectOrderDto) {
    return this.portal.rejectOrder(id, req.user.id, dto.reason);
  }

  @Patch('menu')
  @ApiOperation({ summary: 'Mettre à jour menu et disponibilité' })
  menu(@Request() req: { user: { id: string } }, @Body() dto: UpdateRestaurantMenuDto) {
    return this.portal.updateMenu(req.user.id, dto);
  }

  @Patch('location')
  @ApiOperation({ summary: 'Mettre à jour adresse et coordonnées GPS du restaurant' })
  location(@Request() req: { user: { id: string } }, @Body() dto: UpdateRestaurantLocationDto) {
    return this.portal.updateLocation(req.user.id, dto);
  }

  @Post('menu-photo')
  @ApiOperation({ summary: 'Téléverser photo plat (base64)' })
  menuPhoto(@Request() req: { user: { id: string } }, @Body() dto: UploadMenuPhotoDto) {
    return this.portal.uploadMenuPhoto(req.user.id, dto.imageBase64, dto.mimeType);
  }

  @Get('promos')
  @ApiOperation({ summary: 'Codes promo du restaurant' })
  listPromos(@Request() req: { user: { id: string } }) {
    return this.partnerPromo.listRestaurantPromos(req.user.id);
  }

  @Post('promos')
  @ApiOperation({ summary: 'Créer un code promo restaurant' })
  createPromo(@Request() req: { user: { id: string } }, @Body() dto: PartnerPromoDto) {
    return this.partnerPromo.createRestaurantPromo(req.user.id, dto);
  }

  @Patch('promos/:id')
  @ApiOperation({ summary: 'Modifier un code promo restaurant' })
  updatePromo(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: Partial<PartnerPromoDto>,
  ) {
    return this.partnerPromo.updateRestaurantPromo(req.user.id, id, dto);
  }

  @Get('orders/:id/receipt')
  @ApiOperation({ summary: 'Reçu partenaire commande livrée (JSON)' })
  orderReceipt(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.partnerBilling.buildRestaurantOrderReceipt(req.user.id, id);
  }

  @Get('orders/:id/receipt/pdf')
  @ApiOperation({ summary: 'Reçu partenaire commande (PDF)' })
  @ApiProduces('application/pdf')
  async orderReceiptPdf(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.partnerBilling.getRestaurantPdf(req.user.id, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
  }
}
