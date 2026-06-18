import { Body, Controller, Get, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WalletService } from './wallet.service';

class WithdrawDto {
  @ApiProperty() @IsInt() @Min(500) amountCdf: number;
  @ApiProperty() @IsString() provider: string;
  @ApiProperty() @IsString() phone: string;
}

class TopUpDto {
  @ApiProperty() @IsInt() @Min(500) amountCdf: number;
  @ApiPropertyOptional({ enum: ['ORANGE_MONEY', 'MPESA', 'AIRTEL_MONEY', 'MOCK'] })
  @IsOptional()
  @IsEnum(['ORANGE_MONEY', 'MPESA', 'AIRTEL_MONEY', 'MOCK'])
  provider?: string;
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

  @Post('top-up')
  @ApiOperation({ summary: 'Recharger portefeuille (mock Mobile Money)' })
  topUp(@Request() req: { user: { id: string } }, @Body() dto: TopUpDto) {
    return this.walletService.topUp(req.user.id, dto.amountCdf, dto.provider ?? 'MOCK');
  }

  @Post('topup')
  @ApiOperation({ summary: 'Alias recharge portefeuille' })
  topUpAlias(@Request() req: { user: { id: string } }, @Body() dto: TopUpDto) {
    return this.walletService.topUp(req.user.id, dto.amountCdf, dto.provider ?? 'MOCK');
  }

  @Post('pay')
  @ApiOperation({ summary: 'Payer un service depuis le portefeuille' })
  pay(@Request() req: { user: { id: string } }, @Body() dto: PayFromWalletDto) {
    return this.walletService.payFromWallet(req.user.id, dto.amountCdf, dto.referenceType, dto.referenceId, dto.description);
  }

  @Post('withdraw')
  @ApiOperation({ summary: 'Retrait mobile money' })
  async withdraw(@Request() req: { user: { id: string } }, @Body() dto: WithdrawDto) {
    return this.walletService.withdrawToMobileMoney(req.user.id, dto.amountCdf, dto.provider, dto.phone);
  }
}
