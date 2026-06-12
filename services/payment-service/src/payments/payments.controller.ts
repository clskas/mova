import { Body, Controller, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProcessPaymentDto } from './payments.dto';
import { PaymentsService } from './payments.service';
@ApiTags('payments')
@Controller('payments')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}
  @Post('rides/:rideId')
  @ApiOperation({ summary: 'Payer une course' })
  payRide(@Request() req: { user: { id: string } }, @Param('rideId') rideId: string, @Body() dto: ProcessPaymentDto) {
    return this.paymentsService.payRide(rideId, req.user.id, dto.method, dto.phone, dto.amountCdf);
  }
}
