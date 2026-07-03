import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class SendReceiptEmailDto {
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
}

export class BillingReferenceParams {
  @IsString() referenceType: string;
  @IsString() referenceId: string;
}
