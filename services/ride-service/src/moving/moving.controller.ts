import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MovingRequestStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateMovingDto, EstimateMovingDto } from './moving.dto';
import { MovingService } from './moving.service';

class UpdateMovingStatusDto {
  status!: MovingRequestStatus;
}

@ApiTags('moving')
@Controller('moving')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MovingController {
  constructor(private movingService: MovingService) {}

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
