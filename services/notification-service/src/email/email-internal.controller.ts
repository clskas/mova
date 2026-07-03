import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';
import { InternalApiGuard } from '../common/internal-api.guard';
import { EmailService } from './email.service';

class SendEmailDto {
  @IsEmail() to: string;
  @IsString() subject: string;
  @IsString() text: string;
  @IsOptional() @IsString() html?: string;
  @IsOptional() attachment?: { filename: string; contentBase64: string; mimeType?: string };
}

@ApiTags('internal')
@Controller('internal')
@UseGuards(InternalApiGuard)
export class EmailInternalController {
  constructor(private email: EmailService) {}

  @Post('email')
  send(@Body() dto: SendEmailDto) {
    return this.email.send(dto);
  }
}
