import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateMovingDto, EstimateMovingDto, UpdateMovingStatusDto } from './moving.dto';
import { MovingService } from './moving.service';

@ApiTags('moving')
@Controller('moving')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MovingController {
  constructor(private movingService: MovingService) {}

  @Post('estimate-volume')
  @ApiOperation({ summary: 'Estimer le volume (m³) à partir des photos des pièces (IA)' })
  estimateVolume(@Body() body: { photoUrls?: string[] }) {
    return this.movingService.estimateVolumeFromPhotos(body?.photoUrls ?? []);
  }

  @Post('estimate')
  @ApiOperation({ summary: 'Estimer déménagement (volume + distance, CDF)' })
  estimate(@Body() dto: EstimateMovingDto) {
    return this.movingService.estimate(dto);
  }

  @Post()
  @ApiOperation({ summary: 'Créer demande de déménagement' })
  create(@Request() req: { user: { id: string } }, @Body() dto: CreateMovingDto) {
    return this.movingService.create(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Historique déménagements' })
  list(@Request() req: { user: { id: string } }) {
    return this.movingService.list(req.user.id);
  }

  @Get('assignments')
  @ApiOperation({ summary: 'Déménagements assignés au chauffeur' })
  assignments(@Request() req: { user: { id: string } }) {
    return this.movingService.listForDriver(req.user.id);
  }

  @Get('offers')
  @ApiOperation({ summary: 'Déménagements ouverts que ce chauffeur peut prendre (utilitaire/camion assez grand)' })
  offers(@Request() req: { user: { id: string } }) {
    return this.movingService.listOffersForDriver(req.user.id);
  }

  @Post(':id/accept')
  @ApiOperation({ summary: 'Accepter un déménagement ouvert (chauffeur, premier arrivé)' })
  accept(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.movingService.acceptByDriver(id, req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail déménagement (passager ou chauffeur assigné)' })
  get(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.movingService.getForParticipant(id, req.user.id);
  }

  @Patch(':id/driver-status')
  @ApiOperation({ summary: 'Mettre à jour statut déménagement (chauffeur assigné)' })
  driverStatus(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: UpdateMovingStatusDto,
  ) {
    return this.movingService.updateStatusByDriver(id, req.user.id, dto.status);
  }

  @Post(':id/actual-volume')
  @ApiOperation({ summary: 'Chauffeur : volume réel constaté sur place (ajuste le prix si plus grand)' })
  actualVolume(@Request() req: { user: { id: string } }, @Param('id') id: string, @Body('volumeM3') volumeM3: number) {
    return this.movingService.reportActualVolume(id, req.user.id, Number(volumeM3));
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Annuler déménagement' })
  cancel(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.movingService.cancel(id, req.user.id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Mettre à jour statut déménagement' })
  status(@Request() req: { user: { id: string } }, @Param('id') id: string, @Body() dto: UpdateMovingStatusDto) {
    return this.movingService.updateStatus(id, req.user.id, dto.status);
  }
}
