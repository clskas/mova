import { VoiceOrderService } from './voice-order.service';

jest.mock('../common/ai-vision.util', () => ({ runAiText: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ai = require('../common/ai-vision.util') as { runAiText: jest.Mock };

describe('VoiceOrderService', () => {
  const geo = { autocomplete: jest.fn() };
  const service = new VoiceOrderService(geo as never);

  it('fills destination candidates and the vehicle from the sentence', async () => {
    ai.runAiText.mockResolvedValueOnce({
      available: true,
      result: { understood: true, pickup: '', dropoff: 'Limete 7e rue', vehicleType: 'MOTO_TAXI', passengerCount: 0, clarification: '' },
    });
    geo.autocomplete.mockResolvedValueOnce([{ label: 'Limete 7e rue', lat: -4.38, lng: 15.34 }]);
    const r = await service.parse({ text: 'je veux une moto pour Limete 7e rue', city: 'Kinshasa' });
    expect(r).toMatchObject({ available: true, understood: true, vehicleType: 'MOTO_TAXI', passengerCount: null, pickupText: null });
    expect((r as { dropoffCandidates: unknown[] }).dropoffCandidates).toHaveLength(1);
  });

  it('asks for precision when the place is not found', async () => {
    ai.runAiText.mockResolvedValueOnce({
      available: true,
      result: { understood: true, pickup: '', dropoff: 'chez Papa Inconnu', vehicleType: '', passengerCount: 0, clarification: '' },
    });
    geo.autocomplete.mockResolvedValueOnce([]);
    const r = (await service.parse({ text: 'emmène-moi chez Papa Inconnu' })) as { clarification: string; vehicleType: null };
    expect(r.clarification).toContain('Précisez');
    expect(r.vehicleType).toBeNull();
  });

  it('AI off: tells the app to fall back to typing', async () => {
    ai.runAiText.mockResolvedValueOnce({ available: false, result: null, message: 'IA désactivée.' });
    const r = await service.parse({ text: 'Gombe' });
    expect(r).toMatchObject({ available: false });
  });
});
