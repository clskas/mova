import * as net from 'net';
import {
  EMAIL_RESEND_ADMIN_MESSAGE,
  EMAIL_RESEND_FALLBACK_ADMIN_MESSAGE,
  EMAIL_SMTP_ACCEPTED_ADMIN_MESSAGE,
  EmailOtpMailer,
} from './email-otp.mailer';

/** Plain-text fake SMTP server (no TLS: any port other than 25/465/587/2525). */
function fakeSmtp(mode: 'ok' | 'stall'): Promise<{ port: number; close: () => void; messages: number }> {
  return new Promise((resolve) => {
    const state = { messages: 0 };
    const server = net.createServer((sock) => {
      sock.on('error', () => undefined); // the client hangs up when it gives up
      if (mode === 'stall') return; // accepts, never greets — like the blocked SmarterASP
      sock.write('220 fake ESMTP\r\n');
      let inData = false;
      let buf = '';
      sock.on('data', (chunk) => {
        buf += chunk.toString();
        if (inData) {
          if (buf.includes('\r\n.\r\n')) {
            inData = false;
            buf = '';
            state.messages += 1;
            sock.write('250 queued\r\n');
          }
          return;
        }
        let i: number;
        while ((i = buf.indexOf('\r\n')) >= 0) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 2);
          if (line.startsWith('EHLO')) sock.write('250-fake\r\n250 AUTH PLAIN\r\n');
          else if (line.startsWith('AUTH')) sock.write('235 ok\r\n');
          else if (line.startsWith('MAIL') || line.startsWith('RCPT')) sock.write('250 ok\r\n');
          else if (line === 'DATA') {
            inData = true;
            sock.write('354 go\r\n');
            return;
          } else if (line === 'QUIT') sock.end('221 bye\r\n');
        }
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port;
      resolve({
        port,
        close: () => server.close(),
        get messages() {
          return state.messages;
        },
      });
    });
  });
}

function mailer(env: Record<string, string>) {
  return new EmailOtpMailer({ get: (k: string) => env[k] } as never);
}

describe('EmailOtpMailer — SmarterASP first, Resend as relay', () => {
  const savedFetch = global.fetch;
  let fetchMock: jest.Mock;
  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' });
    global.fetch = fetchMock as never;
  });
  afterEach(() => {
    global.fetch = savedFetch;
  });

  const smtpEnv = (port: number) => ({
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: String(port),
    SMTP_USER: 'noreply@afri-soft.com',
    SMTP_PASS: 'x',
    SMTP_FROM: 'noreply@afri-soft.com',
    SMTP_STEP_TIMEOUT_MS: '300',
  });

  it('sends through SMTP when SmarterASP answers, without touching Resend', async () => {
    const smtp = await fakeSmtp('ok');
    try {
      const r = await mailer({ ...smtpEnv(smtp.port), RESEND_API_KEY: 're_test' }).sendNotice('a@gmail.com', 'S', 'T');
      expect(r).toEqual({ success: true, message: EMAIL_SMTP_ACCEPTED_ADMIN_MESSAGE });
      expect(smtp.messages).toBe(1);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      smtp.close();
    }
  });

  it('falls back to Resend when SmarterASP stalls', async () => {
    const smtp = await fakeSmtp('stall');
    try {
      const r = await mailer({ ...smtpEnv(smtp.port), RESEND_API_KEY: 're_test' }).sendNotice('a@gmail.com', 'S', 'T');
      expect(r).toEqual({ success: true, message: EMAIL_RESEND_FALLBACK_ADMIN_MESSAGE });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe('https://api.resend.com/emails');
    } finally {
      smtp.close();
    }
  });

  it('reports the SMTP failure when SmarterASP stalls and Resend fails too', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const smtp = await fakeSmtp('stall');
    try {
      const r = await mailer({ ...smtpEnv(smtp.port), RESEND_API_KEY: 're_test' }).sendNotice('a@gmail.com', 'S', 'T');
      expect(r.success).toBe(false);
    } finally {
      smtp.close();
    }
  });

  it('uses Resend alone when no SMTP is configured', async () => {
    const r = await mailer({ RESEND_API_KEY: 're_test', RESEND_FROM: 'noreply@afri-soft.com' }).sendNotice('a@gmail.com', 'S', 'T');
    expect(r).toEqual({ success: true, message: EMAIL_RESEND_ADMIN_MESSAGE });
  });
});
