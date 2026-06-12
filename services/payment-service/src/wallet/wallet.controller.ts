import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WalletService } from './wallet.service';
class WithdrawDto {
  @ApiProperty() @IsInt() @Min(100) amountCdf: number;
  @ApiProperty() @IsString() provider: string;
  @ApiProperty() @IsString() phone: string;
}
@ApiTags('wallet')
@Controller('wallet')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WalletController {
  constructor(private walletService: WalletService) {}
  @Get()
  @ApiOperation({ summary: 'Solde portefeuille CDF' })
  get(@Request() req: { user: { id: string } }) { return this.walletService.getWallet(req.user.id); }
  @Post('withdraw')
  @ApiOperation({ summary: 'Retrait mobile money' })
  async withdraw(@Request() req: { user: { id: string } }, @Body() dto: WithdrawDto) {
    await this.walletService.debit(req.user.id, dto.amountCdf, `Retrait ${dto.provider} vers ${dto.phone}`);
    return { success: true, message: `Retrait de ${dto.amountCdf} FC en cours`, amountCdf: dto.amountCdf };
  }
}
