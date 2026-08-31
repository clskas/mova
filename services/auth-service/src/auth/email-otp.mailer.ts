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

/** True when the buffer holds a complete SMTP reply (last line is `NNN ` not `NNN-`). */
export function smtpReplyComplete(buffer: string): boolean {
  const normalized = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n').filter((line) => line.length > 0);
  if (!lines.length) return false;
  return /^\d{3} /.test(lines[lines.length - 1]);
}

const SMTP_TIMEOUT_MS = 20_000;

async function smtpSend(opts: SmtpOpts): Promise<void> {
  const implicitTls = opts.port === 465;
  const state: { socket: net.Socket } = {
    socket: implicitTls
      ? tls.connect({ host: opts.host, port: opts.port, servername: opts.host })
      : net.connect(opts.port, opts.host),
  };

  const timed = <T>(p: Promise<T>, label: string): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`SMTP timeout (${label})`)), SMTP_TIMEOUT_MS);
      p.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        },
      );
    });

  let buf = '';
  const onData = (chunk: Buffer) => {
    buf += chunk.toString('utf8');
  };
  const attach = (sock: net.Socket) => {
    sock.on('data', onData);
  };
  attach(state.socket);

  const read = () =>
    timed(
      new Promise<string>((resolve, reject) => {
        const tryResolve = () => {
          if (smtpReplyComplete(buf)) {
            const out = buf;
            buf = '';
            resolve(out);
            return true;
          }
          return false;
        };
        if (tryResolve()) return;
        const onChunk = () => {
          if (tryResolve()) {
            state.socket.off('error', onErr);
            state.socket.off('data', onChunk);
          }
        };
        const onErr = (e: Error) => {
          state.socket.off('data', onChunk);
          reject(e);
        };
        state.socket.on('data', onChunk);
        state.socket.once('error', onErr);
      }),
      'read',
    );

  const expect = async (ok: string[]) => {
    const reply = await read();
    const code = reply.trimStart().slice(0, 3);
    if (!ok.includes(code)) {
      throw new Error(`SMTP unexpected: ${reply.trim().slice(0, 120)}`);
    }
    return reply;
  };

  const write = (cmd: string) => {
    state.socket.write(`${cmd}\r\n`);
  };

  try {
    await expect(['220']);
    write('EHLO senga');
    await expect(['250']);
    if (!implicitTls && (opts.port === 587 || opts.port === 25)) {
      write('STARTTLS');
      await expect(['220']);
      const upgraded = await timed(
        new Promise<tls.TLSSocket>((resolve, reject) => {
          let next: tls.TLSSocket;
          next = tls.connect({ socket: state.socket, servername: opts.host }, () => resolve(next));
          next.once('error', reject);
        }),
        'starttls',
      );
      state.socket.removeListener('data', onData);
      state.socket = upgraded;
      buf = '';
      attach(state.socket);
      write('EHLO senga');
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
    state.socket.write(`${opts.message}\r\n.\r\n`);
    await expect(['250']);
    write('QUIT');
  } finally {
    try {
      state.socket.end();
    } catch {
      /* ignore */
    }
    state.socket.destroy();
  }
}
