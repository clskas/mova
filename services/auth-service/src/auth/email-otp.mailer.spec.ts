import {
  EMAIL_SMTP_ENV_HINT,
  allowsSharedMailCertFallback,
  inferSmtpHost,
  mapSmtpFailureToAdminMessage,
  smtpConnectHost,
  smtpPeerMatchesSharedMailCert,
  smtpReplyComplete,
  smtpTlsConnectOptions,
  smtpTlsServername,
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

describe('site4now TLS hostname mismatch', () => {
  it('uses the documented SSL host so STARTTLS matches *.site4now.net', () => {
    expect(inferSmtpHost('noreply@afri-soft.com', 'mail.afri-soft.com')).toBe('mail.afri-soft.com');
    expect(smtpTlsServername('mail.afri-soft.com')).toBe('mail5013.site4now.net');
    expect(smtpConnectHost('mail.afri-soft.com')).toBe('mail5013.site4now.net');
  });

  it('prefers a site4now CNAME over the customer SMTP_HOST', () => {
    expect(smtpTlsServername('mail.afri-soft.com', 'mail5018.site4now.net')).toBe('mail5018.site4now.net');
    expect(smtpConnectHost('mail.example.com', 'mail5013.site4now.net')).toBe('mail5013.site4now.net');
  });

  it('keeps well-known provider hosts unchanged', () => {
    expect(smtpTlsServername('smtp.gmail.com')).toBe('smtp.gmail.com');
    expect(smtpConnectHost('smtp.gmail.com')).toBe('smtp.gmail.com');
    expect(allowsSharedMailCertFallback('smtp.gmail.com')).toBe(false);
  });

  it('accepts a *.site4now.net peer cert for the customer CNAME without disabling TLS', () => {
    const cert = { subject: { CN: '*.site4now.net' }, subjectaltname: 'DNS:*.site4now.net, DNS:site4now.net' };
    expect(smtpPeerMatchesSharedMailCert(cert)).toBe(true);
    expect(allowsSharedMailCertFallback('mail.afri-soft.com')).toBe(true);
    const opts = smtpTlsConnectOptions('mail.afri-soft.com');
    expect(opts.servername).toBe('mail5013.site4now.net');
    expect(opts.rejectUnauthorized).not.toBe(false);
    expect(typeof opts.checkServerIdentity).toBe('function');
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
