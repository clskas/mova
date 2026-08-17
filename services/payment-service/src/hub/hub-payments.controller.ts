import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { HubHmacGuard } from './hub-hmac.guard';
import { HubPaymentsService } from './hub-payments.service';
import { CreateHubPaymentDto } from './hub-payments.dto';

@ApiExcludeController()
@Controller('v1')
@UseGuards(HubHmacGuard)
export class HubPaymentsController {
  constructor(private readonly hub: HubPaymentsService) {}

  @Post('payments')
  @HttpCode(201)
  async createPayment(
    @Req() req: { hubAppId?: string },
    @Body() dto: CreateHubPaymentDto,
  ) {
    const result = await this.hub.createCollect(req.hubAppId ?? dto.app_id, dto);
    return result.body;
  }

  @Post('payouts')
  @HttpCode(201)
  async createPayout(
    @Req() req: { hubAppId?: string },
    @Body() dto: CreateHubPaymentDto,
  ) {
    const result = await this.hub.createPayout(req.hubAppId ?? dto.app_id, dto);
    return result.body;
  }

  @Get('payments/by-reference/:reference')
  getByReference(
    @Req() req: { hubAppId?: string },
    @Param('reference') reference: string,
  ) {
    return this.hub.getByReference(req.hubAppId ?? '', reference);
  }

  @Get('payments/:paymentId')
  getById(
    @Req() req: { hubAppId?: string },
    @Param('paymentId') paymentId: string,
  ) {
    return this.hub.getById(req.hubAppId ?? '', paymentId);
  }
}
