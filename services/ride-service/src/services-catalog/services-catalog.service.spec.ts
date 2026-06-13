import { ServiceCategory } from '@mova/shared';
import { ServicesCatalogService } from './services-catalog.service';

describe('ServicesCatalogService', () => {
  const service = new ServicesCatalogService();

  it('liste les services MOVA avec disponibilité', () => {
    const services = service.list();
    expect(services.length).toBeGreaterThanOrEqual(5);
    const parcel = services.find((s) => s.id === 'parcel');
    expect(parcel).toMatchObject({ nameFr: 'Livraison colis', available: true, category: ServiceCategory.DELIVERY });
    const express = services.find((s) => s.id === 'express');
    expect(express?.available).toBe(true);
    const moving = services.find((s) => s.id === 'moving');
    expect(moving?.available).toBe(true);
  });
});
