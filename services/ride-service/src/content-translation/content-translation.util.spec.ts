import { applyContentTranslations, collectContentTexts, isContentRoute, sourceKey } from './content-translation.util';

describe('content translation', () => {
  const restaurant = {
    id: 'r1',
    name: 'Chez Flore',
    cuisine: 'Congolais',
    promotionLabel: '-10 % ce soir',
    menuItems: [
      { id: 'm1', name: 'Poulet mayo', unitPriceCdf: 12000, description: 'Avec frites et salade', sizes: [{ label: 'Grand', priceCdf: 15000 }] },
    ],
    driver: { name: 'Jean Mukendi', phone: '+243900000000', description: 'ne doit pas partir' },
  };

  it('collects partner texts only, never people', () => {
    const texts = collectContentTexts(restaurant);
    expect([...texts].sort()).toEqual(
      ['-10 % ce soir', 'Avec frites et salade', 'Chez Flore', 'Congolais', 'Grand', 'Poulet mayo'].sort(),
    );
    expect(texts.has('Jean Mukendi')).toBe(false);
    expect(texts.has('ne doit pas partir')).toBe(false);
  });

  it('replaces known texts and keeps the rest', () => {
    const dict = new Map([
      ['Poulet mayo', 'Mayo chicken'],
      ['Congolais', 'Congolese'],
      ['Grand', 'Large'],
    ]);
    const out = applyContentTranslations(restaurant, dict) as typeof restaurant;
    expect(out.cuisine).toBe('Congolese');
    expect(out.menuItems[0].name).toBe('Mayo chicken');
    expect(out.menuItems[0].sizes[0].label).toBe('Large');
    expect(out.menuItems[0].description).toBe('Avec frites et salade');
    expect(out.name).toBe('Chez Flore');
    expect(out.driver).toEqual(restaurant.driver);
  });

  it('only catalogue GET routes, never chats', () => {
    expect(isContentRoute('GET', '/api/deliveries/restaurants/1')).toBe(true);
    expect(isContentRoute('GET', '/rental/vehicles?city=Kinshasa')).toBe(true);
    expect(isContentRoute('GET', '/publicites')).toBe(true);
    expect(isContentRoute('POST', '/deliveries/food')).toBe(false);
    expect(isContentRoute('GET', '/deliveries/1/chat')).toBe(false);
    expect(isContentRoute('GET', '/admin/users')).toBe(false);
  });

  it('keys are stable', () => {
    expect(sourceKey('Poulet mayo')).toBe(sourceKey('Poulet mayo'));
    expect(sourceKey('Poulet mayo')).not.toBe(sourceKey('Poulet Mayo'));
  });
});
