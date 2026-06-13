import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ErrandOrderStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateErrandOrderDto } from './errands.dto';
import { ErrandsService } from './errands.service';

class UpdateErrandStatusDto {
  status!: ErrandOrderStatus;
}

@ApiTags('errands')
@Controller('errands')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ErrandsController {
  constructor(private errandsService: ErrandsService) {}

  @Post('estimate')
  @ApiOperation({ summary: 'Estimer course/commission (CDF)' })
  estimate(@Body() dto: CreateErrandOrderDto) {
    return this.errandsService.estimate(dto);
  }

  @Post()
  @ApiOperation({ summary: 'Créer commande courses/commissions' })
  create(@Request() req: { user: { id: string } }, @Body() dto: CreateErrandOrderDto) {
    return this.errandsService.create(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Historique commandes courses' })
  list(@Request() req: { user: { id: string } }) {
    return this.errandsService.list(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail commande courses' })
  get(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.errandsService.get(id, req.user.id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Annuler commande courses' })
  cancel(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.errandsService.cancel(id, req.user.id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Mettre à jour statut commande courses' })
  status(@Request() req: { user: { id: string } }, @Param('id') id: string, @Body() dto: UpdateErrandStatusDto) {
    return this.errandsService.updateStatus(id, req.user.id, dto.status);
  }
}
