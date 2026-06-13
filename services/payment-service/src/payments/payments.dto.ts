import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { PaymentMethod } from '@prisma/client';
export class ProcessPaymentDto {
  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;
  @ApiProperty({ required: false, description: 'Requis pour Orange Money, M-Pesa et Airtel Money' })
  @IsOptional()
  @IsString()
  phone?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  amountCdf?: number;
}
