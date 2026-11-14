import { Body, Controller, Delete, Get, HttpStatus, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { RideStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformConfigService } from '../platform/platform-config.service';
import { fetchAuthUserBrief } from '../common/internal-lookup.util';
import { ProposedFareDto } from './rides.dto';
import { RidesService } from './rides.service';

/** Favourite drivers and the passenger's price proposal (Automatisations). */
@ApiTags('rides')
@Controller('rides')
@UseGuards(JwtAuthGuard)
export class RideGrowthController {
  constructor(
    private prisma: PrismaService,
    private rides: RidesService,
    private platformConfig: PlatformConfigService,
  ) {}

  @Get('favorite-drivers')
  @ApiOperation({ summary: 'Mes chauffeurs favoris' })
  async listFavorites(@Request() req: { user: { id: string } }) {
    const rows = await this.prisma.favoriteDriver.findMany({ where: { passengerId: req.user.id }, orderBy: { createdAt: 'desc' } });
    const drivers = await Promise.all(
      rows.map(async (r) => {
        const u = await fetchAuthUserBrief(r.driverUserId);
        return { driverUserId: r.driverUserId, name: [u?.firstName, u?.lastName].filter(Boolean).join(' ') || 'Chauffeur SENGA' };
      }),
    );
    return { enabled: this.platformConfig.get().automations.favoriteDrivers.enabled, drivers };
  }

  @Post('favorite-drivers/:driverUserId')
  @ApiOperation({ summary: 'Ajouter un chauffeur favori (après une course avec lui)' })
  async addFavorite(@Request() req: { user: { id: string } }, @Param('driverUserId') driverUserId: string) {
    if (!this.platformConfig.get().automations.favoriteDrivers.enabled) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Les chauffeurs favoris ne sont pas activés.');
    }
    const rode = await this.prisma.ride.findFirst({
      where: { passengerId: req.user.id, driverId: driverUserId, status: RideStatus.COMPLETED },
      select: { id: true },
    });
    if (!rode) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Vous pouvez ajouter un chauffeur après une course terminée avec lui.');
    }
    const count = await this.prisma.favoriteDriver.count({ where: { passengerId: req.user.id } });
    if (count >= 10) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, '10 chauffeurs favoris au maximum.');
    }
    await this.prisma.favoriteDriver.upsert({
      where: { passengerId_driverUserId: { passengerId: req.user.id, driverUserId } },
      create: { passengerId: req.user.id, driverUserId },
      update: {},
    });
    return { success: true, favorite: true };
  }

  @Delete('favorite-drivers/:driverUserId')
  @ApiOperation({ summary: 'Retirer un chauffeur favori' })
  async removeFavorite(@Request() req: { user: { id: string } }, @Param('driverUserId') driverUserId: string) {
    await this.prisma.favoriteDriver.deleteMany({ where: { passengerId: req.user.id, driverUserId } });
    return { success: true, favorite: false };
  }

  @Post(':id/proposed-fare')
  @ApiOperation({ summary: 'Changer le prix proposé tant qu’aucun chauffeur n’a accepté' })
  proposedFare(@Request() req: { user: { id: string } }, @Param('id') id: string, @Body() dto: ProposedFareDto) {
    return this.rides.updateProposedFare(id, req.user.id, dto.proposedFareCdf);
  }
}
