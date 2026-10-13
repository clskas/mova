import { Body, Controller, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DeliveryLiveKitService } from './delivery-livekit.service';

/** Routes LiveKit pour les courses (module deliveries pour éviter cycle Rides↔Deliveries). */
@ApiTags('rides')
@Controller('rides')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RideVoiceController {
  constructor(private liveKit: DeliveryLiveKitService) {}

  @Post(':id/livekit-token')
  @ApiOperation({ summary: 'Jeton LiveKit pour appel vocal course (passager / chauffeur)' })
  liveKitToken(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() body?: { announce?: boolean },
  ) {
    return this.liveKit.createToken('ride', id, req.user.id, {
      announce: body?.announce === true,
    });
  }

  @Post(':id/livekit-end')
  @ApiOperation({ summary: 'Fin d’appel vocal course — coupe la sonnerie chez l’autre' })
  liveKitEnd(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.liveKit.endCall('ride', id, req.user.id);
  }
}
