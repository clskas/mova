import { aiSwitchOn, setAdminAiEnabled } from './ai-switch';
import { claudeAvailable } from '../ocr/claude-json';

describe('AI master switch', () => {
  afterEach(() => setAdminAiEnabled(true));

  it('needs both the server setting and the super admin switch', () => {
    const env = { AI_ENABLED: 'true', ANTHROPIC_API_KEY: 'k' } as NodeJS.ProcessEnv;
    expect(aiSwitchOn(env)).toBe(true);
    expect(claudeAvailable(env)).toBe(true);
    setAdminAiEnabled(false);
    expect(aiSwitchOn(env)).toBe(false);
    expect(claudeAvailable(env)).toBe(false);
  });

  it('stays off when the server disables AI, whatever the switch', () => {
    setAdminAiEnabled(true);
    expect(aiSwitchOn({ AI_ENABLED: 'false' } as NodeJS.ProcessEnv)).toBe(false);
  });
});
