import {
  EMAIL_GMAIL_SMTP_UNTRUSTED_ADMIN_MESSAGE,
  EMAIL_RESEND_ADMIN_MESSAGE,
  EMAIL_SMTP_ACCEPTED_ADMIN_MESSAGE,
  EMAIL_SMTP_ENV_HINT,
  SENGA_ACCESS_MAIL_SUBJECT,
  allowsSharedMailCertFallback,
  emailInboxHintFor,
  inferSmtpHost,
  isGmailAddress,
  sengaAccessMailCopy,
  mapSmtpFailureToAdminMessage,
  smtpEhloHostname,
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

describe('sengaAccessMailCopy', () => {
  it('never puts OTP or code PIN in the subject (MessageAI)', () => {
    const pin = sengaAccessMailCopy('482917', { partnerPortals: true });
    const otp = sengaAccessMailCopy('482917');
    for (const copy of [pin, otp]) {
      expect(copy.subject).toBe(SENGA_ACCESS_MAIL_SUBJECT);
      expect(copy.subject).not.toMatch(/otp|code PIN/i);
      expect(copy.text).not.toMatch(/otp|code PIN/i);
      expect(copy.html).not.toMatch(/otp|code PIN/i);
      expect(copy.text).toContain('482917');
    }
    expect(pin.text).toContain('restaurant.afri-soft.com');
  });
});

describe('emailInboxHintFor', () => {
  it('warns Gmail about site4now spam bounce and DMARC reject', () => {
    expect(isGmailAddress('jscelestinkas@gmail.com')).toBe(true);
    expect(isGmailAddress('resto@afri-soft.com')).toBe(false);
    expect(emailInboxHintFor('jscelestinkas@gmail.com')).toMatch(/MessageAI/);
    expect(emailInboxHintFor('jscelestinkas@gmail.com')).toMatch(/DKIM/);
    expect(EMAIL_SMTP_ACCEPTED_ADMIN_MESSAGE).toMatch(/Gmail peut rejeter \(DKIM\/DMARC\)/);
    expect(EMAIL_SMTP_ACCEPTED_ADMIN_MESSAGE).not.toMatch(/envoyé/);
    expect(EMAIL_RESEND_ADMIN_MESSAGE).toMatch(/Resend/);
    expect(EMAIL_GMAIL_SMTP_UNTRUSTED_ADMIN_MESSAGE).toMatch(/Copiez le PIN/);
    expect(EMAIL_GMAIL_SMTP_UNTRUSTED_ADMIN_MESSAGE).not.toMatch(/PIN envoyé/);
  });
});

describe('smtpEhloHostname', () => {
  it('uses a FQDN derived from the From domain, not a bare HELO', () => {
    expect(smtpEhloHostname('noreply@afri-soft.com')).toBe('senga.afri-soft.com');
    expect(smtpEhloHostname('noreply@afri-soft.com')).not.toBe('senga');
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
