import { commerceTypeFromSearch, commerceTypeLabel, userRoleDisplayLabel } from './commerce-type';

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

describe('commerceTypeFromSearch', () => {
  it('mappe les libellés FR / EN vers le type', () => {
    expect(commerceTypeFromSearch('Pharmacie')).toBe('PHARMACY');
    expect(commerceTypeFromSearch('boutique')).toBe('BOUTIQUE');
    expect(commerceTypeFromSearch('Supermarché')).toBe('SUPERMARKET');
    expect(commerceTypeFromSearch('resto')).toBe('RESTAURANT');
    expect(commerceTypeFromSearch('chauffeur')).toBeUndefined();
  });
});
