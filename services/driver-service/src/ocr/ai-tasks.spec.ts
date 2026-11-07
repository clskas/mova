import { AI_TEXT_TASKS, AI_VISION_TASKS, isAiTextTask, isAiVisionTask } from './ai-tasks';

describe('AI tasks', () => {
  it('knows every vision and text task, and nothing else', () => {
    expect(['RECEIPT', 'MOVING_VOLUME', 'MENU', 'RENTAL_LISTING'].every(isAiVisionTask)).toBe(true);
    expect(['ANALYTICS_ANSWER', 'DAILY_SUMMARY', 'REPLY_DRAFT', 'TRANSLATE_CONTENT'].every(isAiTextTask)).toBe(true);
    expect(AI_TEXT_TASKS.TRANSLATE_CONTENT.prompt({ texts: { a: 'Poulet mayo' } })).toContain('Poulet mayo');
    expect(AI_TEXT_TASKS.TRANSLATE_CONTENT.prompt({ texts: {}, target: 'sw' })).toContain('swahili');
    expect(AI_TEXT_TASKS.TRANSLATE_CONTENT.prompt({ texts: {}, target: 'ln' })).toContain('lingala');
    expect(isAiVisionTask('toString')).toBe(false);
    expect(isAiTextTask('MENU')).toBe(false);
  });

  it('limits each vision task to its own upload folder (never KYC)', () => {
    for (const def of Object.values(AI_VISION_TASKS)) {
      expect(def.uploadCategories).not.toContain('kyc');
      expect(def.uploadCategories.length).toBeGreaterThan(0);
    }
    expect(AI_VISION_TASKS.MENU.uploadCategories).toEqual(['menu']);
    expect(AI_VISION_TASKS.RENTAL_LISTING.uploadCategories).toEqual(['vehicles']);
  });

  it('builds prompts from context without throwing', () => {
    expect(AI_VISION_TASKS.RENTAL_LISTING.prompt({ vehicle: { name: 'Toyota RAV4', seats: 5 } })).toContain('RAV4');
    expect(AI_TEXT_TASKS.ANALYTICS_ANSWER.prompt({ question: 'Combien de courses ?', data: '{}' })).toContain('Combien de courses');
    expect(AI_TEXT_TASKS.REPLY_DRAFT.prompt({ message: 'Livraison en retard' })).toContain('retard');
  });
});
