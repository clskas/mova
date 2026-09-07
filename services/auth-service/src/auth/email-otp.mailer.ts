import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as net from 'net';
import * as tls from 'tls';
import { isMockOtpAllowed, maskEmail } from '@mova/shared';

export const EMAIL_UNAVAILABLE_USER_MESSAGE =
  'Impossible d\'envoyer le code par e-mail. Réessayez plus tard, ou connectez-vous avec un numéro +243.';

/** Exact Render keys for mova-auth — listed when transport is incomplete. */
export const EMAIL_SMTP_ENV_HINT =
  'E-mail non configuré sur mova-auth. Définissez SMTP_HOST, SMTP_USER, SMTP_PASS (SMTP_PORT=587, SMTP_FROM) ou RESEND_API_KEY et RESEND_FROM.';

export type EmailOtpSendResult = {
  success: boolean;
  message: string;
};

/**
 * SMTP host when SMTP_HOST is omitted.
 * Gmail / Microsoft / Yahoo / Zoho have well-known hosts.
 * Other domains (cPanel, SmarterASP/site4now) use mail.{domain}.
 */
export function inferSmtpHost(userOrFrom: string, explicitHost?: string): string | undefined {
  const explicit = (explicitHost ?? '').trim();
  if (explicit) return explicit;
  const domain = (userOrFrom.split('@')[1] ?? '').trim().toLowerCase();
  if (!domain) return undefined;
  if (domain === 'gmail.com' || domain === 'googlemail.com') return 'smtp.gmail.com';
  if (domain === 'outlook.com' || domain === 'hotmail.com' || domain === 'live.com') {
    return 'smtp.office365.com';
  }
  if (domain === 'yahoo.com' || domain.endsWith('.yahoo.com')) return 'smtp.mail.yahoo.com';
  if (domain === 'zoho.com' || domain.endsWith('.zoho.com')) return 'smtp.zoho.com';
  return `mail.${domain}`;
}

export function mapSmtpFailureToAdminMessage(raw: string): string {
  const lower = raw.toLowerCase();
  if (/535|534|535-5\.7|authentication|auth invalid|invalid login|incorrect password/.test(lower)) {
    return 'Authentification SMTP refusée. Vérifiez SMTP_USER et SMTP_PASS sur mova-auth.';
  }
  if (/timeout/.test(lower)) {
    return 'Délai SMTP dépassé. Vérifiez SMTP_HOST et SMTP_PORT=587 sur mova-auth.';
  }
  if (/econnrefused|enotfound|getaddrinfo/.test(lower)) {
    return 'SMTP_HOST injoignable. Vérifiez SMTP_HOST sur mova-auth (ex. mail.votredomaine.com).';
  }
  return EMAIL_UNAVAILABLE_USER_MESSAGE;
}

@Injectable()
export class EmailOtpMailer {
  private readonly logger = new Logger(EmailOtpMailer.name);

  constructor(private config: ConfigService) {}

  isConfigured(): boolean {
    return this.resendKey() !== '' || this.smtpReady();
  }

  /** Generic transactional mail. Never logs the body (PIN / motif). */
  async sendNotice(to: string, subject: string, text: string, html?: string): Promise<EmailOtpSendResult> {
    const dest = to.trim().toLowerCase();
    if (isMockOtpAllowed()) {
      this.logger.log(`[MOCK EMAIL] → ${maskEmail(dest)}`);
      return { success: true, message: 'E-mail simulé (MOCK_OTP)' };
    }
    if (!this.isConfigured()) {
      this.logger.error(`EMAIL not sent to ${maskEmail(dest)} — ${EMAIL_SMTP_ENV_HINT}`);
      return { success: false, message: EMAIL_SMTP_ENV_HINT };
    }
    const from = this.fromAddress();
    const safeHtml = html ?? `<p>${escapeHtml(text).replace(/\n/g, '<br/>')}</p>`;
    try {
      if (this.resendKey()) {
        return await this.sendResend(dest, from, subject, text, safeHtml);
      }
      return await this.sendSmtp(dest, from, subject, text);
    } catch (e) {
      const detail = (e as Error).message;
      this.logger.error(`EMAIL send failed for ${maskEmail(dest)}: ${detail}`);
      return { success: false, message: mapSmtpFailureToAdminMessage(detail) };
    }
  }

  async sendLoginPin(to: string, pin: string): Promise<EmailOtpSendResult> {
    const subject = 'Votre code PIN SENGA';
    const text =
      `Votre code PIN de connexion SENGA est prêt. Saisissez-le pour ouvrir l'application.\n\n` +
      `Code : ${pin}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.`;
    const html = `<p>Votre code PIN de connexion SENGA est <strong>${pin}</strong>.</p><p>Saisissez-le pour ouvrir l'application.</p>`;
    return this.sendNotice(to, subject, text, html);
  }

  async sendOtp(to: string, code: string): Promise<EmailOtpSendResult> {
    const dest = to.trim().toLowerCase();
    if (isMockOtpAllowed()) {
      this.logger.log(`[MOCK EMAIL OTP] → ${maskEmail(dest)}`);
      return { success: true, message: 'Code OTP e-mail simulé (MOCK_OTP)' };
    }

    if (!this.isConfigured()) {
      this.logger.error(
        `EMAIL OTP not sent to ${maskEmail(dest)} — ${EMAIL_SMTP_ENV_HINT} OTP was still issued; do not skip verification.`,
      );
      return { success: false, message: EMAIL_SMTP_ENV_HINT };
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
      const detail = (e as Error).message;
      this.logger.error(`EMAIL OTP send failed for ${maskEmail(dest)}: ${detail}`);
      return { success: false, message: mapSmtpFailureToAdminMessage(detail) };
    }
  }

  private resendKey(): string {
    return (this.config.get<string>('RESEND_API_KEY') ?? '').trim();
  }

  private smtpUser(): string {
    return (this.config.get<string>('SMTP_USER') ?? '').trim();
  }

  private fromAddress(): string {
    const from = (this.config.get<string>('SMTP_FROM') ?? this.config.get<string>('RESEND_FROM') ?? '').trim();
    if (from) return from;
    const user = this.smtpUser();
    if (user.includes('@')) return user;
    return 'noreply@mova.cd';
  }

  private smtpReady(): boolean {
    const user = this.smtpUser();
    const pass = (this.config.get<string>('SMTP_PASS') ?? '').trim();
    const host = inferSmtpHost(user, this.config.get<string>('SMTP_HOST'));
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
    const user = this.smtpUser();
    const host = inferSmtpHost(user, this.config.get<string>('SMTP_HOST'))!;
    const explicitHost = (this.config.get<string>('SMTP_HOST') ?? '').trim();
    if (!explicitHost) {
      this.logger.warn(`SMTP_HOST unset — using inferred ${host}`);
    }
    const port = Number(this.config.get('SMTP_PORT') ?? 587);
    const pass = this.config.get<string>('SMTP_PASS') ?? '';
    const envelopeFrom = user.includes('@') ? user : from;
    const message = [
      `From: SENGA <${from}>`,
      `To: ${to}`,
      `Subject: ${encodeRfc2047(subject)}`,
      `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      text,
    ].join('\r\n');

    await smtpSend({ host, port, user, pass, from: envelopeFrom, to, message });
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function encodeRfc2047(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${b64(value)}?=`;
}

function ehloAuthMethods(reply: string): Set<string> {
  const methods = new Set<string>();
  for (const line of reply.split(/\r?\n/)) {
    const match = line.match(/^\d{3}[\s-]AUTH\s+(.+)/i);
    if (!match) continue;
    for (const part of match[1].split(/\s+/)) {
      const name = part.trim().toUpperCase();
      if (name) methods.add(name);
    }
  }
  return methods;
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

  const authPlain = async () => {
    write(`AUTH PLAIN ${b64(`\u0000${opts.user}\u0000${opts.pass}`)}`);
    await expect(['235']);
  };

  const authLogin = async () => {
    write('AUTH LOGIN');
    await expect(['334']);
    write(b64(opts.user));
    await expect(['334']);
    write(b64(opts.pass));
    await expect(['235']);
  };

  try {
    await expect(['220']);
    write('EHLO senga');
    let ehlo = await expect(['250']);
    if (!implicitTls && (opts.port === 587 || opts.port === 25 || opts.port === 2525)) {
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
      ehlo = await expect(['250']);
    }
    const auth = ehloAuthMethods(ehlo);
    try {
      if (auth.has('PLAIN') || auth.size === 0) {
        await authPlain();
      } else {
        await authLogin();
      }
    } catch (first) {
      if (auth.has('LOGIN') && (auth.has('PLAIN') || auth.size === 0)) {
        await authLogin();
      } else {
        throw first;
      }
    }
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
