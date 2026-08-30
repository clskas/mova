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
  /** Ignored — fare always comes from the ride/service record. Kept so old apps do not 400. */
  @ApiProperty({ required: false, deprecated: true })
  @IsOptional()
  @IsInt()
  amountCdf?: number;
}
