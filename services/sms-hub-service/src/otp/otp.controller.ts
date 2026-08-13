import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { HmacGuard } from '../auth/hmac.guard';
import { OtpService } from './otp.service';
import { SendOtpDto, VerifyOtpDto } from './otp.dto';

@Controller('v1/otp')
@UseGuards(HmacGuard)
export class OtpController {
  constructor(private readonly otp: OtpService) {}

  @Post('send')
  send(@Body() dto: SendOtpDto) {
    return this.otp.send(dto);
  }

  @Post('verify')
  verify(@Body() dto: VerifyOtpDto) {
    return this.otp.verify(dto);
  }
}
