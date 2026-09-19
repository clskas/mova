import { commerceTypeLabel, userRoleDisplayLabel } from './commerce-type';

describe('commerceTypeLabel', () => {
  it('distingue resto, boutique, pharmacie et supermarché', () => {
    expect(commerceTypeLabel('RESTAURANT')).toBe('Restaurant');
    expect(commerceTypeLabel('BOUTIQUE')).toBe('Boutique');
    expect(commerceTypeLabel('PHARMACY')).toBe('Pharmacie');
    expect(commerceTypeLabel('SUPERMARKET')).toBe('Supermarché');
  });

  it('affiche le type de commerce pour un compte RESTAURANT', () => {
    expect(userRoleDisplayLabel('RESTAURANT', 'PHARMACY')).toBe('Pharmacie');
    expect(userRoleDisplayLabel('RESTAURANT', 'BOUTIQUE')).toBe('Boutique');
    expect(userRoleDisplayLabel('DRIVER')).toBe('Chauffeur');
  });
});
