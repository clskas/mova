import { keepsPlaceholders, translationKey } from './content-translation.service';
import { sourceKey } from './content-translation.util';

describe('translation cache keys and checks', () => {
  it('English keeps the historical key; other languages get their own', () => {
    expect(translationKey('en', 'Poulet mayo')).toBe(sourceKey('Poulet mayo'));
    expect(translationKey('sw', 'Poulet mayo')).not.toBe(translationKey('ln', 'Poulet mayo'));
  });

  it('refuses translations that lose placeholders or line breaks', () => {
    expect(keepsPlaceholders('Payer {v1}', 'Lipa {v1}')).toBe(true);
    expect(keepsPlaceholders('Payer {v1}', 'Lipa')).toBe(false);
    expect(keepsPlaceholders('Ligne 1\nLigne 2', 'Mstari 1 Mstari 2')).toBe(false);
    expect(keepsPlaceholders('Réf. {0}', 'Ref. {0}')).toBe(true);
  });
});
