import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WalletService } from './wallet.service';

/** Soldes de test pour comptes démo lorsque MOCK_PAYMENTS=true. */
const DEMO_WALLET_CREDITS: { userId: string; amountCdf: number; label: string }[] = [
  { userId: '11111111-1111-1111-1111-111111111101', amountCdf: 250_000, label: 'Passager démo 1' },
  { userId: '11111111-1111-1111-1111-111111111102', amountCdf: 150_000, label: 'Passager démo 2' },
  { userId: '22222222-2222-2222-2222-222222222201', amountCdf: 100_000, label: 'Chauffeur démo 1' },
];

@Injectable()
export class WalletSeedService implements OnModuleInit {
  private readonly logger = new Logger(WalletSeedService.name);

  constructor(
    private config: ConfigService,
    private wallet: WalletService,
  ) {}

  async onModuleInit() {
    if (this.config.get('MOCK_PAYMENTS') !== 'true') return;
    for (const demo of DEMO_WALLET_CREDITS) {
      try {
        const current = await this.wallet.getWallet(demo.userId);
        if (current.balanceCdf >= 50_000) continue;
        await this.wallet.credit(
          demo.userId,
          demo.amountCdf,
          `Solde test SENGA — ${demo.label}`,
          `seed_demo_wallet_${demo.userId}`,
        );
        this.logger.log(`Wallet démo crédité : ${demo.label} (+${demo.amountCdf} FC)`);
      } catch (e) {
        this.logger.warn(`Wallet seed ignoré pour ${demo.userId}`, e);
      }
    }
  }
}
