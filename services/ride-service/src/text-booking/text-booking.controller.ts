import { Body, Controller, Get, Headers, HttpCode, Logger, Post, Query, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import { TextBookingService } from './text-booking.service';

function sameSecret(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Public callbacks of the USSD aggregator and of WhatsApp (no app login).
 * USSD: ?key=USSD_WEBHOOK_KEY. WhatsApp: verify token + X-Hub-Signature-256 (app secret).
 */
@ApiExcludeController()
@Controller('public/booking')
export class TextBookingController {
  private readonly logger = new Logger(TextBookingController.name);

  constructor(private booking: TextBookingService) {}

  @Post('ussd')
  @HttpCode(200)
  async ussd(
    @Query('key') key: string | undefined,
    @Body() body: { phoneNumber?: string; text?: string },
    @Res() res: Response,
  ) {
    res.type('text/plain');
    if (!sameSecret(key, process.env.USSD_WEBHOOK_KEY?.trim())) return res.status(403).send('END Accès refusé.');
    const out = await this.booking.ussd(String(body?.phoneNumber ?? ''), String(body?.text ?? ''));
    return res.send(out);
  }

  @Get('whatsapp')
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    if (mode === 'subscribe' && sameSecret(token, process.env.WHATSAPP_VERIFY_TOKEN?.trim())) {
      return res.status(200).type('text/plain').send(challenge);
    }
    return res.status(403).send('forbidden');
  }

  @Post('whatsapp')
  @HttpCode(200)
  async whatsapp(@Req() req: Request & { rawBody?: Buffer }, @Headers('x-hub-signature-256') signature: string | undefined) {
    const secret = process.env.WHATSAPP_APP_SECRET?.trim();
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    const expected = secret ? `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}` : '';
    if (!sameSecret(signature, expected)) return { ok: false };
    const entries = (req.body as { entry?: Array<{ changes?: Array<{ value?: { messages?: Array<{ from?: string; type?: string; text?: { body?: string } }> } }> }> })?.entry ?? [];
    for (const e of entries) {
      for (const c of e.changes ?? []) {
        for (const m of c.value?.messages ?? []) {
          if (m.type !== 'text' || !m.from) continue;
          const reply = await this.booking.whatsapp(`+${m.from}`, m.text?.body ?? '');
          await this.send(m.from, reply);
        }
      }
    }
    return { ok: true };
  }

  private async send(to: string, text: string) {
    const token = process.env.WHATSAPP_TOKEN?.trim();
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
    if (!token || !phoneId) return;
    try {
      await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(phoneId)}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text.slice(0, 1000) } }),
        signal: AbortSignal.timeout(8000),
      });
    } catch (e) {
      this.logger.warn(`whatsapp send: ${String(e)}`);
    }
  }
}
