import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as net from 'net';

export type EmailAttachment = {
  filename: string;
  contentBase64: string;
  mimeType?: string;
};

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachment?: EmailAttachment;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private config: ConfigService) {}

  private isMock() {
    if (this.config.get('NODE_ENV') === 'production') return false;
    return this.config.get('MOCK_EMAIL') !== 'false';
  }

  async send(input: SendEmailInput) {
    if (this.isMock()) {
      this.logger.log(`[MOCK EMAIL] → ${input.to}: ${input.subject}`);
      if (input.attachment) this.logger.log(`[MOCK EMAIL] pièce jointe: ${input.attachment.filename}`);
      return { success: true, message: 'E-mail simulé (MOCK_EMAIL)' };
    }

    const host = this.config.get<string>('SMTP_HOST');
    const port = Number(this.config.get('SMTP_PORT') ?? 587);
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    const from = this.config.get<string>('SMTP_FROM') ?? 'noreply@mova.cd';

    if (!host || !user || !pass) {
      this.logger.warn('SMTP non configuré');
      return { success: false, message: 'E-mail non configuré (SMTP_HOST, SMTP_USER, SMTP_PASS)' };
    }

    const boundary = `mova-${Date.now()}`;
    const lines = [
      `From: SENGA RDC <${from}>`,
      `To: ${input.to}`,
      `Subject: ${input.subject}`,
      'MIME-Version: 1.0',
    ];

    if (input.attachment) {
      lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`, '');
      lines.push(`--${boundary}`);
      lines.push('Content-Type: text/plain; charset=utf-8', '', input.text, '');
      lines.push(`--${boundary}`);
      lines.push(
        `Content-Type: ${input.attachment.mimeType ?? 'application/octet-stream'}; name="${input.attachment.filename}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${input.attachment.filename}"`,
        '',
        input.attachment.contentBase64,
        `--${boundary}--`,
      );
    } else {
      lines.push('Content-Type: text/plain; charset=utf-8', '', input.text);
    }

    const message = lines.join('\r\n');

    await new Promise<void>((resolve, reject) => {
      const socket = net.connect(port, host, () => {
        socket.write(`EHLO mova\r\nMAIL FROM:<${from}>\r\nRCPT TO:<${input.to}>\r\nDATA\r\n${message}\r\n.\r\nQUIT\r\n`);
      });
      socket.on('error', reject);
      socket.on('close', () => resolve());
      setTimeout(() => {
        socket.destroy();
        resolve();
      }, 8000);
    });

    return { success: true, message: 'E-mail envoyé' };
  }
}
