import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ValidatePromoDto } from '../deliveries/deliveries.dto';
import { formatPromoValidation } from '../common/promo-apply.util';
import { PromoApplyContext } from '../common/promo-context.util';
import { PrismaService } from '../prisma/prisma.service';
import { PromoService } from '../rides/surcharge.service';

const SERVICE_TYPES = new Set(['RIDE', 'FOOD', 'PARCEL', 'EXPRESS', 'ERRAND', 'SCHEDULED', 'MOVING', 'RENTAL']);

@ApiTags('promo')
@Controller('promo')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PromoController {
  constructor(
    private promo: PromoService,
    private prisma: PrismaService,
  ) {}

  @Post('validate')
  @ApiOperation({ summary: 'Valider un code promo (plateforme ou partenaire)' })
  async validate(@Body() dto: ValidatePromoDto) {
    let context: PromoApplyContext | undefined;
    if (dto.serviceType && SERVICE_TYPES.has(dto.serviceType.toUpperCase())) {
      context = { serviceType: dto.serviceType.toUpperCase() as PromoApplyContext['serviceType'] };
      if (dto.restaurantId) context.restaurantId = dto.restaurantId;
      if (dto.vehicleId) {
        const vehicle = await this.prisma.rentalVehicle.findUnique({ where: { id: dto.vehicleId } });
        if (vehicle?.ownerUserId) context.rentalOwnerUserId = vehicle.ownerUserId;
      }
    }
    const row = await this.promo.peek(dto.code, context);
    return formatPromoValidation(row);
  }
}
