import { smtpReplyComplete } from './email-otp.mailer';

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
