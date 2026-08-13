import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * App registry from env (VPS secrets, never commit):
 *   AFRISOFT_HUB_APPS=senga:<api_key>,educongo:<api_key>
 */
@Injectable()
export class AppsRegistry implements OnModuleInit {
  private readonly logger = new Logger(AppsRegistry.name);
  private readonly keys = new Map<string, string>();

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const raw = this.config.get<string>('AFRISOFT_HUB_APPS')?.trim() || '';
    for (const part of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
      const idx = part.indexOf(':');
      if (idx <= 0) continue;
      const appId = part.slice(0, idx).trim().toLowerCase();
      const apiKey = part.slice(idx + 1).trim();
      if (appId && apiKey) this.keys.set(appId, apiKey);
    }
    if (this.keys.size === 0) {
      // Bootstrap placeholders so MOCK hub is testable without real secrets in git.
      const senga = this.config.get<string>('APP_KEY_SENGA')?.trim();
      const educongo = this.config.get<string>('APP_KEY_EDUCONGO')?.trim();
      if (senga) this.keys.set('senga', senga);
      if (educongo) this.keys.set('educongo', educongo);
    }
    this.logger.log(`Hub apps registered: ${[...this.keys.keys()].join(', ') || '(none)'}`);
  }

  getApiKey(appId: string): string | undefined {
    return this.keys.get(appId.trim().toLowerCase());
  }

  has(appId: string): boolean {
    return this.keys.has(appId.trim().toLowerCase());
  }

  listAppIds(): string[] {
    return [...this.keys.keys()];
  }
}
