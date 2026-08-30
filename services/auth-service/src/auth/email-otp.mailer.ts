import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as net from 'net';
import * as tls from 'tls';
import { isMockOtpAllowed, maskEmail } from '@mova/shared';

export const EMAIL_UNAVAILABLE_USER_MESSAGE =
  'Impossible d\'envoyer le code par e-mail. Réessayez plus tard, ou connectez-vous avec un numéro +243.';

export type EmailOtpSendResult = {
  success: boolean;
  message: string;
};

@Injectable()
export class EmailOtpMailer {
  private readonly logger = new Logger(EmailOtpMailer.name);

  constructor(private config: ConfigService) {}

  isConfigured(): boolean {
    return this.resendKey() !== '' || this.smtpReady();
  }

  async sendOtp(to: string, code: string): Promise<EmailOtpSendResult> {
    const dest = to.trim().toLowerCase();
    if (isMockOtpAllowed()) {
      this.logger.log(`[MOCK EMAIL OTP] → ${maskEmail(dest)}`);
      return { success: true, message: 'Code OTP e-mail simulé (MOCK_OTP)' };
    }

    if (!this.isConfigured()) {
      this.logger.error(
        `EMAIL OTP not sent to ${maskEmail(dest)} — SMTP_* or RESEND_API_KEY missing. OTP was still issued; do not skip verification.`,
      );
      return {
        success: false,
        message: 'E-mail OTP non configuré (SMTP_HOST/SMTP_USER/SMTP_PASS ou RESEND_API_KEY)',
      };
    }

    const subject = 'Votre code SENGA';
    const text =
      `Votre code de connexion SENGA est ${code}. Il expire dans 10 minutes.\n\n` +
      `Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.`;
    const html = `<p>Votre code de connexion SENGA est <strong>${code}</strong>.</p><p>Il expire dans 10 minutes.</p>`;
    const from = this.fromAddress();

    try {
      if (this.resendKey()) {
        return await this.sendResend(dest, from, subject, text, html);
      }
      return await this.sendSmtp(dest, from, subject, text);
    } catch (e) {
      this.logger.error(`EMAIL OTP send failed for ${maskEmail(dest)}: ${(e as Error).message}`);
      return { success: false, message: EMAIL_UNAVAILABLE_USER_MESSAGE };
    }
  }

  private resendKey(): string {
    return (this.config.get<string>('RESEND_API_KEY') ?? '').trim();
  }

  private fromAddress(): string {
    return (this.config.get<string>('SMTP_FROM') ?? this.config.get<string>('RESEND_FROM') ?? 'noreply@mova.cd').trim();
  }

  private smtpReady(): boolean {
    const host = (this.config.get<string>('SMTP_HOST') ?? '').trim();
    const user = (this.config.get<string>('SMTP_USER') ?? '').trim();
    const pass = (this.config.get<string>('SMTP_PASS') ?? '').trim();
    return Boolean(host && user && pass);
  }

  private async sendResend(
    to: string,
    from: string,
    subject: string,
    text: string,
    html: string,
  ): Promise<EmailOtpSendResult> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.resendKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `SENGA <${from}>`,
        to: [to],
        subject,
        text,
        html,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.error(`Resend HTTP ${res.status}: ${body.slice(0, 200)}`);
      return { success: false, message: EMAIL_UNAVAILABLE_USER_MESSAGE };
    }
    return { success: true, message: 'Code OTP envoyé par e-mail' };
  }

  private async sendSmtp(to: string, from: string, subject: string, text: string): Promise<EmailOtpSendResult> {
    const host = (this.config.get<string>('SMTP_HOST') ?? '').trim();
    const port = Number(this.config.get('SMTP_PORT') ?? 587);
    const user = (this.config.get<string>('SMTP_USER') ?? '').trim();
    const pass = this.config.get<string>('SMTP_PASS') ?? '';
    const message = [
      `From: SENGA <${from}>`,
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      text,
    ].join('\r\n');

    await smtpSend({ host, port, user, pass, from, to, message });
    return { success: true, message: 'Code OTP envoyé par e-mail' };
  }
}

type SmtpOpts = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  to: string;
  message: string;
};

function b64(value: string) {
  return Buffer.from(value, 'utf8').toString('base64');
}

async function smtpSend(opts: SmtpOpts): Promise<void> {
  const implicitTls = opts.port === 465;
  const socket: net.Socket = implicitTls
    ? tls.connect({ host: opts.host, port: opts.port, servername: opts.host })
    : net.connect(opts.port, opts.host);

  const lines: string[] = [];
  const read = () =>
    new Promise<string>((resolve, reject) => {
      const onData = (chunk: Buffer) => {
        lines.push(chunk.toString('utf8'));
        const joined = lines.join('');
        if (/\r?\n$/.test(joined) || joined.includes('\n')) {
          socket.off('data', onData);
          socket.off('error', reject);
          const out = joined;
          lines.length = 0;
          resolve(out);
        }
      };
      socket.on('data', onData);
      socket.on('error', reject);
    });

  const expect = async (ok: string[]) => {
    const reply = await read();
    if (!ok.some((code) => reply.startsWith(code))) {
      throw new Error(`SMTP unexpected: ${reply.trim().slice(0, 120)}`);
    }
    return reply;
  };

  const write = (cmd: string) => {
    socket.write(`${cmd}\r\n`);
  };

  try {
    await expect(['220']);
    write(`EHLO senga`);
    await expect(['250']);
    if (!implicitTls && opts.port === 587) {
      write('STARTTLS');
      await expect(['220']);
      await new Promise<void>((resolve, reject) => {
        const upgraded = tls.connect({ socket, servername: opts.host }, () => resolve());
        upgraded.on('error', reject);
        Object.assign(socket, upgraded);
      });
      write(`EHLO senga`);
      await expect(['250']);
    }
    write('AUTH LOGIN');
    await expect(['334']);
    write(b64(opts.user));
    await expect(['334']);
    write(b64(opts.pass));
    await expect(['235']);
    write(`MAIL FROM:<${opts.from}>`);
    await expect(['250']);
    write(`RCPT TO:<${opts.to}>`);
    await expect(['250']);
    write('DATA');
    await expect(['354']);
    socket.write(`${opts.message}\r\n.\r\n`);
    await expect(['250']);
    write('QUIT');
  } finally {
    socket.end();
    socket.destroy();
  }
}
