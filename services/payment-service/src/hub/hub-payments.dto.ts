import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
} from 'class-validator';

export class CreateHubPaymentDto {
  @IsString()
  @MinLength(2)
  app_id: string;

  @IsInt()
  @Min(500)
  amount_cdf: number;

  @IsString()
  @IsIn(['CDF'])
  currency: string;

  @IsString()
  @Matches(/^\+?243\d{8,12}$/)
  phone: string;

  @IsString()
  @IsIn(['OM', 'MP', 'AM', 'AF'])
  telecom: string;

  @IsString()
  @MinLength(8)
  reference: string;

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  idempotency_key?: string;
}
