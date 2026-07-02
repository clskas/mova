import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RejectOrderDto, UpdateRestaurantLocationDto, UpdateRestaurantMenuDto, UploadMenuPhotoDto } from './restaurant-portal.dto';
import { RestaurantPortalService } from './restaurant-portal.service';
import { RestaurantRoleGuard } from './restaurant-role.guard';

@ApiTags('restaurant')
@Controller('restaurant')
@UseGuards(JwtAuthGuard, RestaurantRoleGuard)
@ApiBearerAuth()
export class RestaurantPortalController {
  constructor(private portal: RestaurantPortalService) {}

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
}
