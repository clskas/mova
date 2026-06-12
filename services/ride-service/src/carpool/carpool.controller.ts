import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateCarpoolTripDto, JoinCarpoolDto } from './carpool.dto';
import { CarpoolService } from './carpool.service';

@ApiTags('carpool')
@Controller('carpool')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CarpoolController {
  constructor(private carpoolService: CarpoolService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un trajet covoiturage' })
  create(@Request() req: { user: { id: string } }, @Body() dto: CreateCarpoolTripDto) {
    return this.carpoolService.create(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister trajets covoiturage (matching stub)' })
  list(
    @Query('pickupLat') pickupLat?: string,
    @Query('pickupLng') pickupLng?: string,
    @Query('dropoffLat') dropoffLat?: string,
    @Query('dropoffLng') dropoffLng?: string,
  ) {
    return this.carpoolService.list({
      pickupLat: pickupLat ? parseFloat(pickupLat) : undefined,
      pickupLng: pickupLng ? parseFloat(pickupLng) : undefined,
      dropoffLat: dropoffLat ? parseFloat(dropoffLat) : undefined,
      dropoffLng: dropoffLng ? parseFloat(dropoffLng) : undefined,
    });
  }

  @Get('mine')
  @ApiOperation({ summary: 'Mes trajets covoiturage' })
  mine(@Request() req: { user: { id: string } }) {
    return this.carpoolService.myTrips(req.user.id);
  }

  @Post(':id/join')
  @ApiOperation({ summary: 'Rejoindre un trajet covoiturage' })
  join(@Request() req: { user: { id: string } }, @Param('id') id: string, @Body() dto: JoinCarpoolDto) {
    return this.carpoolService.join(id, req.user.id, dto.seats);
  }
}
