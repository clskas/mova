import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { InternalApiGuard } from '../common/internal-api.guard';
import { SmsService } from './sms.providers';

class SendSmsDto {
  @IsString() phone!: string;
  @IsString() text!: string;
  @IsOptional() @IsString() purpose?: string;
}

@ApiTags('internal')
@Controller('internal')
@UseGuards(InternalApiGuard)
export class SmsInternalController {
  constructor(private sms: SmsService) {}

  /** Same AfriSoft SMS hub path as OTP login — used for driver activation PIN. */
  @Post('sms')
  send(@Body() dto: SendSmsDto) {
    return this.sms.sendSms(dto.phone, dto.text, dto.purpose);
  }
}
