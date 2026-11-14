import { TextBookingService } from './text-booking.service';

describe('TextBookingService (USSD)', () => {
  const place = (label: string, lat: number) => [{ label, lat, lng: 15.3 }];
  const geo = { autocomplete: jest.fn(async (q: string) => (q === 'nulle part' ? [] : place(q, -4.3))) };
  const rides = {
    estimate: jest.fn().mockResolvedValue({ totalCdf: 3000 }),
    createRide: jest.fn().mockResolvedValue({ id: 'r1', estimatedFareCdf: 3000 }),
    searchDrivers: jest.fn().mockResolvedValue({}),
  };
  const cfg = (on: boolean) => ({ get: () => ({ automations: { ussdBooking: { enabled: on }, whatsappBooking: { enabled: on } } }) });
  const redis = { client: { get: jest.fn(), setex: jest.fn(), del: jest.fn().mockResolvedValue(1) } };
  const svc = (on = true) => new TextBookingService(geo as never, rides as never, cfg(on) as never, redis as never);

  beforeEach(() => jest.clearAllMocks());

  it('closed when the switch is off', async () => {
    await expect(svc(false).ussd('+243900000001', '')).resolves.toMatch(/^END/);
  });

  it('walks the menu then quotes the price', async () => {
    expect(await svc().ussd('+243900000001', '')).toMatch(/^CON .*Moto-taxi/s);
    expect(await svc().ussd('+243900000001', '1')).toMatch(/^CON Lieu de départ/);
    expect(await svc().ussd('+243900000001', '1*Gombe')).toMatch(/^CON Destination/);
    expect(await svc().ussd('+243900000001', '1*Gombe*Limete')).toMatch(/3000 FC/);
    expect(rides.createRide).not.toHaveBeenCalled();
  });

  it('unknown place stops with a hint', async () => {
    expect(await svc().ussd('+243900000001', '1*nulle part*Limete')).toMatch(/^END .*introuvable/);
  });

  it('cancel does not book', async () => {
    expect(await svc().ussd('+243900000001', '1*Gombe*Limete*2')).toMatch(/^END Commande annulée/);
    expect(rides.createRide).not.toHaveBeenCalled();
  });

  it('confirm books for the phone account (cash) and starts the search', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ id: 'u1', active: true }) } as Response);
    const out = await svc().ussd('+243900000001', '1*Gombe*Limete*1');
    expect(out).toMatch(/^END Course demandée/);
    expect(rides.createRide).toHaveBeenCalledWith('u1', expect.objectContaining({ bookedVia: 'USSD' }));
    expect(rides.searchDrivers).toHaveBeenCalledWith('r1', 'u1');
    fetchMock.mockRestore();
  });
});
