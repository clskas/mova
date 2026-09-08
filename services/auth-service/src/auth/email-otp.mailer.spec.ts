import {
  EMAIL_GMAIL_SMTP_UNTRUSTED_ADMIN_MESSAGE,
  EMAIL_RESEND_ADMIN_MESSAGE,
  EMAIL_SMTP_ACCEPTED_ADMIN_MESSAGE,
  EMAIL_SMTP_ENV_HINT,
  EMAIL_UNAVAILABLE_USER_MESSAGE,
  SENGA_ACCESS_MAIL_SUBJECT,
  SENGA_RENTAL_ACCESS_MAIL_SUBJECT,
  SENGA_RESTAURANT_ACCESS_MAIL_SUBJECT,
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
    const restaurant = sengaAccessMailCopy('482917', { portal: 'restaurant' });
    const rental = sengaAccessMailCopy('482917', { portal: 'rental' });
    const otp = sengaAccessMailCopy('482917');
    for (const copy of [restaurant, rental, otp]) {
      expect(copy.subject).not.toMatch(/otp|code PIN/i);
      expect(copy.text).not.toMatch(/otp|code PIN/i);
      expect(copy.html).not.toMatch(/otp|code PIN/i);
      expect(copy.text).toContain('482917');
    }
    expect(restaurant.subject).toBe(SENGA_RESTAURANT_ACCESS_MAIL_SUBJECT);
    expect(rental.subject).toBe(SENGA_RENTAL_ACCESS_MAIL_SUBJECT);
    expect(otp.subject).toBe(SENGA_ACCESS_MAIL_SUBJECT);
  });

  it('restaurant mail lists only the restaurant portal', () => {
    const copy = sengaAccessMailCopy('319027', { portal: 'restaurant' });
    expect(copy.text).toContain('votre compte SENGA restaurant');
    expect(copy.text).toContain('restaurant.afri-soft.com');
    expect(copy.html).toContain('restaurant.afri-soft.com');
    expect(copy.text).not.toContain('rental.afri-soft.com');
    expect(copy.html).not.toContain('rental.afri-soft.com');
    expect(copy.text).not.toMatch(/Location/i);
    expect(copy.html).not.toMatch(/Location/i);
  });

  it('rental mail lists only the rental portal', () => {
    const copy = sengaAccessMailCopy('319027', { portal: 'rental' });
    expect(copy.text).toContain('votre compte SENGA location');
    expect(copy.text).toContain('rental.afri-soft.com');
    expect(copy.html).toContain('rental.afri-soft.com');
    expect(copy.text).not.toContain('restaurant.afri-soft.com');
    expect(copy.html).not.toContain('restaurant.afri-soft.com');
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
    expect(EMAIL_UNAVAILABLE_USER_MESSAGE).not.toMatch(/\+243/);
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

  it('surfaces MessageAI 550 instead of hiding behind +243', () => {
    expect(
      mapSmtpFailureToAdminMessage(
        'SMTP unexpected: 550 This message cannot be delivered as it was marked as spam',
      ),
    ).toMatch(/550|spam|relais/i);
    expect(
      mapSmtpFailureToAdminMessage(
        'SMTP unexpected: 550 This message cannot be delivered as it was marked as spam',
      ),
    ).not.toMatch(/\+243/);
  });
});
