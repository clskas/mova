import { RentalService } from './rental.service';

describe('RentalService', () => {
  const prisma = {
    rentalInquiry: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
  };

  const service = new RentalService(prisma as never);

  it('crée une demande de location avec message de confirmation', async () => {
    const start = new Date();
    start.setDate(start.getDate() + 1);
    const end = new Date();
    end.setDate(end.getDate() + 3);
    prisma.rentalInquiry.create.mockResolvedValue({
      id: 'r1',
      status: 'PENDING',
      vehicleType: 'SUV',
    });
    const result = await service.create('user-1', {
      vehicleType: 'SUV',
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      pickupAddress: 'Gombe',
    });
    expect(result.inquiry.status).toBe('PENDING');
    expect(result.message).toContain('24h');
  });
});
