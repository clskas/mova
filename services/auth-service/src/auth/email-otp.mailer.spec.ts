import {
  EMAIL_SMTP_ENV_HINT,
  inferSmtpHost,
  mapSmtpFailureToAdminMessage,
  smtpReplyComplete,
} from './email-otp.mailer';

describe('smtpReplyComplete', () => {
  it('waits for the last EHLO line (250 space, not 250-)', () => {
    expect(smtpReplyComplete('250-PIPELINING\r\n')).toBe(false);
    expect(smtpReplyComplete('250-PIPELINING\r\n250-STARTTLS\r\n')).toBe(false);
    expect(smtpReplyComplete('250-PIPELINING\r\n250 AUTH LOGIN\r\n')).toBe(true);
  });

  it('accepts a single-line 220 banner', () => {
    expect(smtpReplyComplete('220 mail.example.com ESMTP\r\n')).toBe(true);
  });
});

describe('inferSmtpHost', () => {
  it('keeps an explicit SMTP_HOST', () => {
    expect(inferSmtpHost('a@afri-soft.com', 'smtp.example.com')).toBe('smtp.example.com');
  });

  it('maps well-known mailbox providers', () => {
    expect(inferSmtpHost('a@gmail.com')).toBe('smtp.gmail.com');
    expect(inferSmtpHost('a@outlook.com')).toBe('smtp.office365.com');
    expect(inferSmtpHost('a@yahoo.com')).toBe('smtp.mail.yahoo.com');
  });

  it('uses mail.{domain} for a custom host (SmarterASP / cPanel)', () => {
    expect(inferSmtpHost('noreply@afri-soft.com')).toBe('mail.afri-soft.com');
  });
});

describe('mapSmtpFailureToAdminMessage', () => {
  it('points SUPER_ADMIN at SMTP_USER / SMTP_PASS on 535', () => {
    expect(mapSmtpFailureToAdminMessage('SMTP unexpected: 535 5.7.8 Authentication failed')).toMatch(
      /SMTP_USER et SMTP_PASS/,
    );
  });

  it('lists the exact env hint constant for ops copy', () => {
    expect(EMAIL_SMTP_ENV_HINT).toMatch(/SMTP_HOST/);
    expect(EMAIL_SMTP_ENV_HINT).toMatch(/RESEND_API_KEY/);
  });
});
