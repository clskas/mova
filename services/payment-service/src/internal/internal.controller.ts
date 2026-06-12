import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsString } from 'class-validator';
import { WalletService } from '../wallet/wallet.service';
import { InternalApiGuard } from '../common/internal-api.guard';
class CreateWalletDto { @IsString() userId: string; }
@Controller('internal')
@UseGuards(InternalApiGuard)
export class InternalController {
  constructor(private wallet: WalletService) {}
  @Post('wallets')
  create(@Body() dto: CreateWalletDto) { return this.wallet.createWallet(dto.userId); }
}
