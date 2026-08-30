import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TrackingService } from './tracking.service';

class RecordPointDto {
  @IsNumber() lat: number;
  @IsNumber() lng: number;
}

@ApiTags('tracking')
@Controller('tracking')
export class TrackingController {
  constructor(private tracking: TrackingService) {}

  @Get(':type/:id/trace')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Trace GPS d\'une course, livraison ou commission' })
  async getTrace(
    @Request() req: { user: { id: string } },
    @Param('type') type: string,
    @Param('id') id: string,
  ) {
    const referenceType = this.tracking.normalizeType(type);
    await this.tracking.assertUserCanAccess(referenceType, id, req.user.id);
    return this.tracking.getTraceSummary(referenceType, id);
  }

  @Post(':type/:id/points')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enregistrer un point GPS (chauffeur / coursier)' })
  async recordPoint(
    @Request() req: { user: { id: string } },
    @Param('type') type: string,
    @Param('id') id: string,
    @Body() dto: RecordPointDto,
  ) {
    const referenceType = this.tracking.normalizeType(type);
    await this.tracking.assertUserCanAccess(referenceType, id, req.user.id);
    return this.tracking.recordPoint(referenceType, id, dto.lat, dto.lng);
  }
}
