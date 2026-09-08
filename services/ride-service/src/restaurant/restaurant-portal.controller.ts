import { Body, Controller, Get, Param, Patch, Post, Query, Request, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PartnerPromoDto } from '../promo/partner-promo.dto';
import { PartnerPromoService } from '../promo/partner-promo.service';
import { PartnerBillingService } from '../billing/partner-billing.service';
import { DeliveryChatService } from '../chat/delivery-chat.service';
import { SendRideChatDto } from '../chat/ride-chat.dto';
import {
  AddRestaurantDriverDto,
  AssignOwnDriverDto,
  RejectOrderDto,
  UpdateCourierModeDto,
  UpdateRestaurantLocationDto,
  UpdateRestaurantMenuDto,
  UploadMenuPhotoDto,
} from './restaurant-portal.dto';
import { RestaurantPortalService } from './restaurant-portal.service';
import { RestaurantRoleGuard } from './restaurant-role.guard';
import { PartnerKycService } from '../partner-kyc/partner-kyc.service';

@ApiTags('restaurant')
@Controller('restaurant')
@UseGuards(JwtAuthGuard, RestaurantRoleGuard)
@ApiBearerAuth()
export class RestaurantPortalController {
  constructor(
    private portal: RestaurantPortalService,
    private partnerPromo: PartnerPromoService,
    private partnerBilling: PartnerBillingService,
    private deliveryChat: DeliveryChatService,
    private partnerKyc: PartnerKycService,
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

  @Get('kyc')
  @ApiOperation({ summary: 'Dossier de validation restaurant' })
  kyc(@Request() req: { user: { id: string } }) {
    return this.partnerKyc.getRestaurantDossier(req.user.id);
  }

  @Patch('kyc')
  @ApiOperation({ summary: 'Mettre à jour RCCM, NIF et paiement' })
  kycProfile(
    @Request() req: { user: { id: string } },
    @Body() body: { nif?: string; rccm?: string; payoutProvider?: string; payoutPhone?: string },
  ) {
    return this.partnerKyc.updateRestaurantProfile(req.user.id, body);
  }

  @Post('kyc/document')
  @ApiOperation({ summary: 'Téléverser un justificatif du dossier' })
  kycDocument(
    @Request() req: { user: { id: string } },
    @Body() body: { type: string; imageBase64: string; mimeType?: string },
  ) {
    return this.partnerKyc.uploadDocument(
      req.user.id,
      'RESTAURANT',
      body.type,
      body.imageBase64,
      body.mimeType,
    );
  }

  @Post('kyc/activation-pin')
  @ApiOperation({ summary: "Confirmer le PIN d'activation après validation du dossier" })
  kycActivationPin(@Request() req: { user: { id: string } }, @Body() body: { pin?: string }) {
    return this.partnerKyc.verifyActivationPin(req.user.id, 'RESTAURANT', body.pin ?? '');
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Tableau de bord partenaire restaurant' })
  dashboard(@Request() req: { user: { id: string } }) {
    return this.portal.getDashboard(req.user.id);
  }

  @Get('orders')
  @ApiOperation({ summary: 'Commandes repas du restaurant' })
  orders(
    @Request() req: { user: { id: string } },
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('q') q?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.portal.listOrders(req.user.id, {
      status,
      from,
      to,
      q,
      skip: skip != null ? Number(skip) : undefined,
      take: take != null ? Number(take) : undefined,
    });
  }

  @Get('earnings')
  @ApiOperation({ summary: 'Solde et ventes repas créditées' })
  earnings(@Request() req: { user: { id: string } }) {
    return this.portal.getEarnings(req.user.id);
  }

  @Get('earnings/report')
  @ApiOperation({ summary: 'Rapport financier filtré (JSON)' })
  earningsReport(
    @Request() req: { user: { id: string } },
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('q') q?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.portal.getEarningsReport(req.user.id, { from, to, q, skip: skip != null ? Number(skip) : undefined, take: take != null ? Number(take) : undefined });
  }

  @Get('earnings/report/csv')
  @ApiOperation({ summary: 'Rapport financier (CSV)' })
  @ApiProduces('text/csv')
  async earningsReportCsv(
    @Request() req: { user: { id: string } },
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('q') q?: string,
  ) {
    const csv = await this.portal.getEarningsReportCsv(req.user.id, { from, to, q });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="mova-restaurant-rapport.csv"`);
    res.send(csv);
  }

  @Get('earnings/report/pdf')
  @ApiOperation({ summary: 'Rapport financier (PDF)' })
  @ApiProduces('application/pdf')
  async earningsReportPdf(
    @Request() req: { user: { id: string } },
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('q') q?: string,
  ) {
    const { buffer, filename } = await this.portal.getEarningsReportPdf(req.user.id, { from, to, q });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
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

  @Post('orders/:id/assign-driver')
  @ApiOperation({ summary: 'Assigner un livreur de la flotte restaurant' })
  assignDriver(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: AssignOwnDriverDto,
  ) {
    return this.portal.assignOwnDriver(id, req.user.id, dto.driverUserId);
  }

  @Get('drivers')
  @ApiOperation({ summary: 'Livreurs internes du restaurant' })
  drivers(@Request() req: { user: { id: string } }) {
    return this.portal.listDrivers(req.user.id);
  }

  @Post('drivers')
  @ApiOperation({ summary: 'Ajouter un livreur à la flotte' })
  addDriver(@Request() req: { user: { id: string } }, @Body() dto: AddRestaurantDriverDto) {
    return this.portal.addDriver(req.user.id, dto);
  }

  @Post('drivers/:driverUserId/remove')
  @ApiOperation({ summary: 'Retirer un livreur de la flotte' })
  removeDriver(@Request() req: { user: { id: string } }, @Param('driverUserId') driverUserId: string) {
    return this.portal.removeDriver(req.user.id, driverUserId);
  }

  @Patch('courier-mode')
  @ApiOperation({ summary: 'Mode livreurs : PLATFORM, OWN ou HYBRID' })
  courierMode(@Request() req: { user: { id: string } }, @Body() dto: UpdateCourierModeDto) {
    return this.portal.updateCourierMode(req.user.id, dto.courierMode);
  }

  @Get('orders/:id/chat')
  @ApiOperation({ summary: 'Messages chat commande (client / livreur)' })
  orderChatList(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.deliveryChat.listMessages(id, req.user.id);
  }

  @Post('orders/:id/chat')
  @ApiOperation({ summary: 'Envoyer un message chat commande' })
  orderChatSend(@Request() req: { user: { id: string } }, @Param('id') id: string, @Body() dto: SendRideChatDto) {
    return this.deliveryChat.sendMessage(id, req.user.id, dto.text);
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
