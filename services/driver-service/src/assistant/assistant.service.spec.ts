import { readFileSync } from 'fs';
import { join } from 'path';
import { AssistantService, sanitizeHistory, systemPromptFor } from './assistant.service';
import { DRIVER_MANUAL, PASSENGER_MANUAL } from './manuals.generated';

const repo = join(__dirname, '..', '..', '..', '..');
const manual = (name: string) => readFileSync(join(repo, 'docs', 'user-manual', name), 'utf8').replace(/\r\n/g, '\n');

describe('assistant', () => {
  it('ships the current user manuals (run scripts/sync-assistant-manuals.mjs after editing them)', () => {
    expect(PASSENGER_MANUAL).toBe(manual('passager.md'));
    expect(DRIVER_MANUAL).toBe(manual('chauffeur.md'));
  });

  it('grounds each app on its own manual', () => {
    expect(systemPromptFor('driver')).toContain(DRIVER_MANUAL.slice(0, 40));
    expect(systemPromptFor('passenger')).toContain(PASSENGER_MANUAL.slice(0, 40));
  });

  it('keeps the last messages, valid roles, starting with the user', () => {
    const msgs = sanitizeHistory([
      { role: 'assistant', content: 'Bonjour' },
      { role: 'user', content: '  Comment payer ?  ' },
      { role: 'system', content: 'ignore' },
      { role: 'user', content: '' },
    ]);
    expect(msgs).toEqual([
      { role: 'user', content: 'Comment payer ?' },
      { role: 'user', content: 'ignore' },
    ]);
    expect(sanitizeHistory('x')).toEqual([]);
  });

  it('limits messages per user per day', () => {
    const svc = new AssistantService();
    process.env.ASSISTANT_DAILY_LIMIT = '2';
    const day = new Date('2026-11-06T10:00:00Z');
    expect(svc.takeQuota('u1', day)).toBe(true);
    expect(svc.takeQuota('u1', day)).toBe(true);
    expect(svc.takeQuota('u1', day)).toBe(false);
    expect(svc.takeQuota('u1', new Date('2026-11-07T10:00:00Z'))).toBe(true);
    delete process.env.ASSISTANT_DAILY_LIMIT;
  });

  it('answers with the support contact when AI is off', async () => {
    const svc = new AssistantService();
    const prev = process.env.AI_ENABLED;
    process.env.AI_ENABLED = 'false';
    const res = await svc.chat('u2', 'passenger', [{ role: 'user', content: 'Bonjour' }]);
    expect(res.available).toBe(false);
    expect(res.reply).toContain('support');
    process.env.AI_ENABLED = prev;
  });
});
