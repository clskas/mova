import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateMovingDto, EstimateMovingDto } from './moving.dto';
import { MovingService } from './moving.service';

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

  @Get(':id')
  @ApiOperation({ summary: 'Détail déménagement' })
  get(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.movingService.get(id, req.user.id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Annuler déménagement' })
  cancel(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.movingService.cancel(id, req.user.id);
  }
}
