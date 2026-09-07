import { Body, Controller, Get, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WalletService } from './wallet.service';

class WithdrawRequestDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(2300) amountCdf: number;
  @ApiProperty() @IsString() provider: string;
  @ApiProperty() @IsString() phone: string;
}

class WithdrawDto extends WithdrawRequestDto {
  @ApiProperty({ description: 'Code OTP à 6 chiffres envoyé au numéro Mobile Money' })
  @IsString()
  @Matches(/^\d{6}$/)
  otp: string;
}

class TopUpDto {
  @ApiProperty() @IsInt() @Min(500) amountCdf: number;
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
  @ApiOperation({ summary: 'Retrait mobile money (OTP requis)' })
  async withdraw(@Request() req: { user: { id: string } }, @Body() dto: WithdrawDto) {
    return this.walletService.withdrawToMobileMoney(req.user.id, dto.amountCdf, dto.provider, dto.phone, {
      otp: dto.otp,
    });
  }
}
