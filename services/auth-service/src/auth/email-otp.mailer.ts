import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as dns from 'dns';
import * as net from 'net';
import * as tls from 'tls';
import { isMockOtpAllowed, maskEmail } from '@mova/shared';

export const EMAIL_UNAVAILABLE_USER_MESSAGE =
  'Impossible d\'envoyer le code par e-mail. Réessayez plus tard, ou connectez-vous avec un numéro +243.';

/** Subject that reached Gmail for the restaurant PIN (no « OTP » / « code PIN »). */
export const SENGA_ACCESS_MAIL_SUBJECT = 'Votre accès SENGA — AfriSoft';

export function sengaAccessMailCopy(code: string, opts?: { partnerPortals?: boolean }) {
  const portals = opts?.partnerPortals === true;
  const who = portals ? 'votre compte partenaire SENGA' : 'votre compte SENGA';
  const portalText = portals
    ? `Restaurant : https://restaurant.afri-soft.com\nLocation : https://rental.afri-soft.com\n\n`
    : '';
  const portalHtml = portals
    ? `<p>Restaurant : <a href="https://restaurant.afri-soft.com">restaurant.afri-soft.com</a><br/>` +
      `Location : <a href="https://rental.afri-soft.com">rental.afri-soft.com</a></p>`
    : '';
  return {
    subject: SENGA_ACCESS_MAIL_SUBJECT,
    text:
      `Bonjour,\n\n` +
      `AfriSoft a généré un code d'accès pour ${who}.\n\n` +
      portalText +
      `Code d'accès (6 chiffres) : ${code}\n\n` +
      `Saisissez-le sur l'écran de connexion. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.\n\n` +
      `— L'équipe SENGA / AfriSoft\nhttps://afri-soft.com`,
    html:
      `<p>Bonjour,</p>` +
      `<p>AfriSoft a généré un code d'accès pour ${who}.</p>` +
      portalHtml +
      `<p>Code d'accès (6 chiffres) : <strong>${code}</strong></p>` +
      `<p>Saisissez-le sur l'écran de connexion. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>` +
      `<p>— L'équipe SENGA / AfriSoft<br/><a href="https://afri-soft.com">afri-soft.com</a></p>`,
  };
}

/**
 * SMTP 250 = site4now accepted DATA. Not inbox proof.
 * Production bounces: 550 MessageAI outbound spam, then Gmail never sees the mail.
 * DNS: DMARC p=reject and no DKIM on afri-soft.com — Gmail can also drop silently.
 */
export const EMAIL_SMTP_ACCEPTED_ADMIN_MESSAGE =
  'Le serveur a accepté mais Gmail peut rejeter (DKIM/DMARC). Vérifiez spam et DNS.';

/** Resend is the only path we treat as able to reach Gmail. */
export const EMAIL_RESEND_ADMIN_MESSAGE = 'E-mail envoyé via Resend.';

/**
 * SMTP 250 is not Gmail delivery. Production NDRs on noreply@:
 * `550 This message cannot be delivered as it was marked as spam`
 * + `X-MessageAI-Scan-Result: high` — site4now blocked the PIN mail before Gmail.
 */
export const EMAIL_GMAIL_SMTP_UNTRUSTED_ADMIN_MESSAGE =
  "Gmail n'est pas confirmé. Copiez le PIN affiché. " +
  'Le relais Afri-Soft a déjà rejeté les mails « code PIN » (550 spam) avant Gmail. ' +
  'Publiez DKIM dans Cloudflare, ou posez RESEND_API_KEY sur mova-auth.';

export function isGmailAddress(to: string): boolean {
  const dest = to.trim().toLowerCase();
  return dest.endsWith('@gmail.com') || dest.endsWith('@googlemail.com');
}

export function emailInboxHintFor(to: string): string {
  if (isGmailAddress(to)) {
    return (
      'Gmail : rien en spam = souvent rejet site4now MessageAI (550) avant Gmail, ' +
      'ou DMARC p=reject sans DKIM. From SENGA <noreply@afri-soft.com> via mail5013.site4now.net.'
    );
  }
  return 'Vérifiez la boîte, le spam, et les bounces de noreply@afri-soft.com.';
}

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

const SHARED_MAIL_CERT_SUFFIXES = ['.site4now.net', '.smarterasp.net'] as const;

/**
 * SmarterASP documents SSL SMTP as mail####.site4now.net (matches *.site4now.net).
 * Customer CNAME mail.afri-soft.com presents that cert, so Node's hostname check
 * fails unless we connect / set tls.servername to the shared host.
 */
const KNOWN_SHARED_SMTP_HOSTS: Record<string, string> = {
  'mail.afri-soft.com': 'mail5013.site4now.net',
};

function normalizeSmtpHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, '');
}

export function isSharedMailCertHost(host: string): boolean {
  const h = normalizeSmtpHost(host);
  return SHARED_MAIL_CERT_SUFFIXES.some((suffix) => h.endsWith(suffix));
}

function isWellKnownProviderSmtpHost(host: string): boolean {
  const h = normalizeSmtpHost(host);
  return (
    h === 'smtp.gmail.com' ||
    h === 'smtp.office365.com' ||
    h === 'smtp.mail.yahoo.com' ||
    h === 'smtp.zoho.com' ||
    h.endsWith('.gmail.com') ||
    h.endsWith('.outlook.com') ||
    h.endsWith('.office365.com') ||
    h.endsWith('.yahoo.com') ||
    h.endsWith('.zoho.com')
  );
}

/** True when SMTP_HOST is a customer mail.* CNAME in front of a shared-host cert. */
export function allowsSharedMailCertFallback(connectHost: string): boolean {
  const h = normalizeSmtpHost(connectHost);
  if (!h || isWellKnownProviderSmtpHost(h)) return false;
  if (isSharedMailCertHost(h)) return true;
  if (KNOWN_SHARED_SMTP_HOSTS[h]) return true;
  return h.startsWith('mail.');
}

export function smtpPeerMatchesSharedMailCert(cert: {
  subject?: { CN?: string | string[] };
  subjectaltname?: string;
}): boolean {
  const names: string[] = [];
  const cn = cert.subject?.CN;
  if (Array.isArray(cn)) names.push(...cn);
  else if (cn) names.push(cn);
  for (const part of (cert.subjectaltname ?? '').split(',')) {
    const match = part.trim().match(/^DNS:(.+)$/i);
    if (match) names.push(match[1]);
  }
  return names.some((name) => isSharedMailCertHost(name.replace(/^\*\./, 'wildcard.')));
}

/**
 * TLS SNI / verify name. Prefer the hostname that matches *.site4now.net
 * (CNAME or known mapping) over the customer SMTP_HOST.
 */
export function smtpTlsServername(connectHost: string, cnameTarget?: string): string {
  const host = normalizeSmtpHost(connectHost);
  const cname = normalizeSmtpHost(cnameTarget ?? '');
  if (cname && isSharedMailCertHost(cname)) return cname;
  if (isSharedMailCertHost(host)) return host;
  return KNOWN_SHARED_SMTP_HOSTS[host] ?? host;
}

/** TCP host: documented SSL host when the cert is on the shared provider. */
export function smtpConnectHost(configuredHost: string, cnameTarget?: string): string {
  const servername = smtpTlsServername(configuredHost, cnameTarget);
  return isSharedMailCertHost(servername) ? servername : normalizeSmtpHost(configuredHost);
}

export function smtpCheckServerIdentity(servername: string, connectHost = servername) {
  return (hostname: string, cert: tls.PeerCertificate): Error | undefined => {
    const err = tls.checkServerIdentity(servername || hostname, cert);
    if (!err) return undefined;
    if (allowsSharedMailCertFallback(connectHost) && smtpPeerMatchesSharedMailCert(cert)) {
      return undefined;
    }
    return err;
  };
}

export function smtpTlsConnectOptions(
  configuredHost: string,
  cnameTarget?: string,
): tls.ConnectionOptions {
  const servername = smtpTlsServername(configuredHost, cnameTarget);
  return {
    servername,
    checkServerIdentity: smtpCheckServerIdentity(servername, configuredHost),
  };
}

/** EHLO must be a FQDN. Bare "senga" looks like a botnet to MessageAI. */
export function smtpEhloHostname(fromAddress: string): string {
  const domain = (fromAddress.split('@')[1] ?? '').trim().toLowerCase().replace(/[>]/g, '');
  if (domain.includes('.')) return `senga.${domain}`;
  return 'senga.afri-soft.com';
}

export async function lookupSmtpCname(host: string): Promise<string | undefined> {
  try {
    const records = await dns.promises.resolveCname(normalizeSmtpHost(host));
    const target = normalizeSmtpHost(records[0] ?? '');
    return target || undefined;
  } catch {
    return undefined;
  }
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
      return await this.sendSmtp(dest, from, subject, text, safeHtml);
    } catch (e) {
      const detail = (e as Error).message;
      this.logger.error(`EMAIL send failed for ${maskEmail(dest)}: ${detail}`);
      return { success: false, message: mapSmtpFailureToAdminMessage(detail) };
    }
  }

  async sendLoginPin(to: string, pin: string): Promise<EmailOtpSendResult> {
    const copy = sengaAccessMailCopy(pin, { partnerPortals: true });
    return this.sendNotice(to, copy.subject, copy.text, copy.html);
  }

  /**
   * Same envelope as the restaurant PIN that reached Gmail (2026-09-08).
   * Never put « OTP » or « code PIN » in the subject — MessageAI 550s those.
   */
  async sendOtp(to: string, code: string): Promise<EmailOtpSendResult> {
    const copy = sengaAccessMailCopy(code);
    return this.sendNotice(to, copy.subject, copy.text, copy.html);
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
        from: `SENGA AfriSoft <${from}>`,
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
    return { success: true, message: EMAIL_RESEND_ADMIN_MESSAGE };
  }

  private async sendSmtp(
    to: string,
    from: string,
    subject: string,
    text: string,
    html?: string,
  ): Promise<EmailOtpSendResult> {
    const user = this.smtpUser();
    const configuredHost = inferSmtpHost(user, this.config.get<string>('SMTP_HOST'))!;
    const explicitHost = (this.config.get<string>('SMTP_HOST') ?? '').trim();
    if (!explicitHost) {
      this.logger.warn(`SMTP_HOST unset — using inferred ${configuredHost}`);
    }
    const explicitTls = (this.config.get<string>('SMTP_TLS_SERVERNAME') ?? '').trim();
    const cname = explicitTls || (await lookupSmtpCname(configuredHost));
    const host = smtpConnectHost(configuredHost, cname);
    const tlsServername = smtpTlsServername(configuredHost, cname);
    if (host !== configuredHost || tlsServername !== configuredHost) {
      this.logger.log(`SMTP TLS ${configuredHost} → host=${host} servername=${tlsServername}`);
    }
    const port = Number(this.config.get('SMTP_PORT') ?? 587);
    const pass = this.config.get<string>('SMTP_PASS') ?? '';
    const envelopeFrom = user.includes('@') ? user : from;
    const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@${(from.split('@')[1] || 'afri-soft.com').replace(/[>]/g, '')}>`;
    const boundary = `senga-alt-${Date.now().toString(36)}`;
    const safeHtml = html ?? `<p>${escapeHtml(text).replace(/\n/g, '<br/>')}</p>`;
    const message = [
      `From: SENGA AfriSoft <${from}>`,
      `To: ${to}`,
      `Reply-To: ${from}`,
      `Subject: ${encodeRfc2047(subject)}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: ${messageId}`,
      'MIME-Version: 1.0',
      `List-Unsubscribe: <mailto:${from}>`,
      'Auto-Submitted: auto-generated',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      text,
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      safeHtml,
      `--${boundary}--`,
    ].join('\r\n');

    const ehloHostname = smtpEhloHostname(from);
    await smtpSend({
      host,
      tlsServername,
      configuredHost,
      port,
      user,
      pass,
      from: envelopeFrom,
      to,
      message,
      ehloHostname,
    });
    this.logger.log(
      `SMTP accepted (250) for ${maskEmail(to)} from=${from} envelope=${envelopeFrom} ehlo=${ehloHostname} — not inbox proof. ${emailInboxHintFor(to)}`,
    );
    if (isGmailAddress(to)) {
      return { success: false, message: EMAIL_GMAIL_SMTP_UNTRUSTED_ADMIN_MESSAGE };
    }
    return { success: true, message: EMAIL_SMTP_ACCEPTED_ADMIN_MESSAGE };
  }
}

type SmtpOpts = {
  host: string;
  tlsServername?: string;
  configuredHost?: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  to: string;
  message: string;
  ehloHostname?: string;
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
  const tlsOpts = smtpTlsConnectOptions(opts.configuredHost ?? opts.host, opts.tlsServername);
  const servername = opts.tlsServername || tlsOpts.servername || opts.host;
  const state: { socket: net.Socket } = {
    socket: implicitTls
      ? tls.connect({
          host: opts.host,
          port: opts.port,
          servername,
          checkServerIdentity: tlsOpts.checkServerIdentity,
        })
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
    const ehloName = opts.ehloHostname || smtpEhloHostname(opts.from);
    await expect(['220']);
    write(`EHLO ${ehloName}`);
    let ehlo = await expect(['250']);
    if (!implicitTls && (opts.port === 587 || opts.port === 25 || opts.port === 2525)) {
      write('STARTTLS');
      await expect(['220']);
      const upgraded = await timed(
        new Promise<tls.TLSSocket>((resolve, reject) => {
          let next: tls.TLSSocket;
          next = tls.connect(
            {
              socket: state.socket,
              servername,
              checkServerIdentity: tlsOpts.checkServerIdentity,
            },
            () => resolve(next),
          );
          next.once('error', reject);
        }),
        'starttls',
      );
      state.socket.removeListener('data', onData);
      state.socket = upgraded;
      buf = '';
      attach(state.socket);
      write(`EHLO ${ehloName}`);
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
