import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { InternalApiGuard } from '../common/internal-api.guard';
import { SmsService } from './sms.service';

class SendSmsDto {
  @IsString() phone!: string;
  @IsString() text!: string;
}

@ApiTags('internal')
@Controller('internal')
@UseGuards(InternalApiGuard)
export class SmsInternalController {
  constructor(private sms: SmsService) {}

  @Post('sms')
  send(@Body() dto: SendSmsDto) {
    return this.sms.sendMessage(dto.phone, dto.text);
  }
}
