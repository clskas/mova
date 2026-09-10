import { Body, Controller, Get, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WalletService } from './wallet.service';

const OTP_REQUIRED_FR = 'Code OTP requis (6 chiffres envoyé au numéro Mobile Money).';
const PHONE_REQUIRED_FR = 'Numéro Mobile Money requis. Format : +243XXXXXXXXX.';
const AMOUNT_INT_FR = 'Montant invalide. Entrez un nombre entier en FC.';
const AMOUNT_MIN_FR = 'Minimum SerdiPay : 2 300 FC.';

/** Whole CDF only — do not round 2300.6 → 2301 (that 400 looked like « Données invalides »). */
export function coerceCdfInteger(value: unknown): unknown {
  if (value === null || value === undefined || value === '') return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number.isInteger(value) ? value : value;
  }
  if (typeof value === 'string') {
    const n = Number(value.replace(/[\s\u00A0\u202F]/g, '').replace(',', '.'));
    if (Number.isInteger(n)) return n;
  }
  return value;
}

class WithdrawRequestDto {
  @ApiProperty()
  @Transform(({ value }) => coerceCdfInteger(value))
  @Type(() => Number)
  @IsInt({ message: AMOUNT_INT_FR })
  @Min(2300, { message: AMOUNT_MIN_FR })
  amountCdf: number;

  @ApiProperty()
  @IsString({ message: 'Opérateur Mobile Money requis (ORANGE_MONEY, MPESA, AIRTEL_MONEY).' })
  @IsNotEmpty({ message: 'Opérateur Mobile Money requis (ORANGE_MONEY, MPESA, AIRTEL_MONEY).' })
  provider: string;

  @ApiProperty()
  @IsString({ message: PHONE_REQUIRED_FR })
  @IsNotEmpty({ message: PHONE_REQUIRED_FR })
  phone: string;
}

class WithdrawDto extends WithdrawRequestDto {
  @ApiProperty({ description: 'Code OTP à 6 chiffres envoyé au numéro Mobile Money' })
  @IsOptional()
  @IsString({ message: OTP_REQUIRED_FR })
  @Matches(/^\d{6}$/, { message: OTP_REQUIRED_FR })
  otp?: string;
}

class TopUpDto {
  @ApiProperty()
  @Transform(({ value }) => coerceCdfInteger(value))
  @Type(() => Number)
  @IsInt({ message: AMOUNT_INT_FR })
  @Min(2300, { message: AMOUNT_MIN_FR })
  amountCdf: number;
  @ApiPropertyOptional({ enum: ['ORANGE_MONEY', 'MPESA', 'AIRTEL_MONEY', 'AFRIMONEY', 'MOCK'] })
  @IsOptional()
  @IsEnum(['ORANGE_MONEY', 'MPESA', 'AIRTEL_MONEY', 'AFRIMONEY', 'MOCK'])
  provider?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
}

class PayFromWalletDto {
  @ApiProperty() @IsInt() @Min(100) amountCdf: number;
  @ApiProperty({ description: 'Type: RIDE, DELIVERY, ERRAND, MOVING, RENTAL, CARPOOL' }) @IsString() referenceType: string;
  @ApiProperty() @IsString() referenceId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

@ApiTags('wallet')
@Controller('wallet')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WalletController {
  constructor(private walletService: WalletService) {}

  @Get()
  @ApiOperation({ summary: 'Solde portefeuille CDF' })
  get(@Request() req: { user: { id: string } }) {
    return this.walletService.getWallet(req.user.id);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Historique transactions portefeuille' })
  transactions(
    @Request() req: { user: { id: string } },
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.walletService.getTransactions(req.user.id, limit ? parseInt(limit, 10) : 20, offset ? parseInt(offset, 10) : 0);
  }

  @Get('top-up/status')
  @ApiOperation({ summary: 'Statut recharge Mobile Money (polling)' })
  topUpStatus(@Request() req: { user: { id: string } }, @Query('providerRef') providerRef?: string) {
    return this.walletService.getTopUpStatus(req.user.id, providerRef?.trim() ?? '');
  }

  @Post('top-up')
  @ApiOperation({ summary: 'Recharger portefeuille (Mobile Money ou simulation dev)' })
  topUp(@Request() req: { user: { id: string } }, @Body() dto: TopUpDto) {
    return this.walletService.topUp(req.user.id, dto.amountCdf, dto.provider ?? '', dto.phone);
  }

  @Post('topup')
  @ApiOperation({ summary: 'Alias recharge portefeuille' })
  topUpAlias(@Request() req: { user: { id: string } }, @Body() dto: TopUpDto) {
    return this.walletService.topUp(req.user.id, dto.amountCdf, dto.provider ?? '', dto.phone);
  }

  @Post('pay')
  @ApiOperation({ summary: 'Payer un service depuis le portefeuille' })
  pay(@Request() req: { user: { id: string } }, @Body() dto: PayFromWalletDto) {
    return this.walletService.payFromWallet(req.user.id, dto.amountCdf, dto.referenceType, dto.referenceId, dto.description);
  }

  @Post('withdraw/otp')
  @ApiOperation({ summary: 'Envoyer un code OTP au numéro Mobile Money de versement' })
  requestWithdrawOtp(@Request() req: { user: { id: string } }, @Body() dto: WithdrawRequestDto) {
    return this.walletService.requestWithdrawOtp(req.user.id, dto.amountCdf, dto.provider, dto.phone);
  }

  @Post('withdraw')
  @ApiOperation({
    summary: 'Retrait mobile money (OTP requis sauf si WITHDRAW_SKIP_OTP=true)',
  })
  async withdraw(@Request() req: { user: { id: string } }, @Body() dto: WithdrawDto) {
    return this.walletService.withdrawToMobileMoney(req.user.id, dto.amountCdf, dto.provider, dto.phone, {
      otp: dto.otp,
    });
  }
}
